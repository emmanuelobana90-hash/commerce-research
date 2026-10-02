// js/contract.js
// Contrat fonctionnel Commerce Research : miroir, côté navigateur, de ce
// que la base Supabase (SQL V3 + incident_description) accepte.
//
// RÈGLE D'OR : ce fichier COPIE la base, il ne l'invente pas.
// La base reste l'autorité : si ce fichier se trompe, elle refuse quand
// même les données invalides. Ici, on sert à prévenir l'erreur avant
// l'envoi, pour afficher un message clair au commerçant.
//
// Ce fichier ne contient ni texte affiché au commerçant, ni appel réseau,
// ni accès à la page. Seulement des données et de petites fonctions pures
// (même entrée -> toujours même sortie).
//
// Les erreurs sont des CODES ("required", "too_long"...), jamais des
// phrases : c'est survey.js qui choisira les mots affichés.

window.CR = window.CR || {};

window.CR.contract = (function () {
  "use strict";

  // ------------------------------------------------------------------
  // 1. VALEURS AUTORISÉES (codes exacts attendus par le SQL)
  // ------------------------------------------------------------------
  var values = {
    activity_type: [
      "retail", "wholesale", "retail_wholesale", "distribution", "craft",
      "production", "food", "services", "construction", "other"
    ],
    role: [
      "owner", "manager", "sales", "cashier", "stock_manager",
      "general_employee", "other"
    ],
    team_size: ["1", "2_5", "6_10", "11_20", "20_plus", "prefer_not_to_say"],
    current_tools: [
      "paper", "whatsapp", "spreadsheet", "management_software",
      "mobile_app", "cash_register", "printed_documents", "none", "other"
    ],
    difficulty_areas: [
      "stock", "sales_orders", "payments_cash", "delivery", "suppliers",
      "employees_coordination", "information_retrieval", "errors_omissions",
      "activity_visibility", "time_management", "other", "none"
    ],
    recent_incident: ["yes", "no", "unknown"],
    incident_types: [
      "product_missing", "order_sale", "payment_cash", "delivery", "supplier",
      "coordination", "information", "error_omission", "time_loss",
      "money_loss", "other", "prefer_not_to_say"
    ],
    resolution_methods: [
      "manual_correction", "phone_call", "whatsapp", "paper_check",
      "spreadsheet", "software", "redo_operation", "wait", "not_resolved",
      "other"
    ],
    recurrence: ["yes_probably", "yes_rarely", "no_resolved", "unknown"],
    solution_interest: ["yes", "maybe", "not_really", "unknown"],
    source: [
      "whatsapp", "facebook", "linkedin", "field", "professional_group",
      "direct_link", "other"
    ],
    contact_method: ["whatsapp", "phone", "email"]
  };

  // ------------------------------------------------------------------
  // 2. LISTES À CHOIX MULTIPLES : règles imposées par le SQL
  // min/max = nombre de choix ; exclusive = valeur qui ne peut pas être
  // combinée avec une autre (null = aucune).
  // ------------------------------------------------------------------
  var multi = {
    current_tools:      { min: 1, max: 4,  exclusive: "none" },
    difficulty_areas:   { min: 1, max: 3,  exclusive: "none" },
    incident_types:     { min: 0, max: 12, exclusive: null },
    resolution_methods: { min: 0, max: 2,  exclusive: null }
  };

  // ------------------------------------------------------------------
  // 3. CHAMPS "AUTRE" : si "other" est choisi, la précision est
  // OBLIGATOIRE ; sinon elle est INTERDITE (le SQL vérifie les deux sens).
  // city_other existe en base mais n'est pas utilisé (ville libre).
  // ------------------------------------------------------------------
  var otherFields = {
    activity_type:      "activity_other",
    role:               "role_other",
    current_tools:      "current_tools_other",
    difficulty_areas:   "difficulty_other",
    incident_types:     "incident_other",
    resolution_methods: "resolution_other",
    source:             "source_other"
  };

  // ------------------------------------------------------------------
  // 4. LIMITES (nombre de CARACTÈRES, pas d'octets, sauf indication)
  // ------------------------------------------------------------------
  var limits = {
    city:                { min: 1, max: 100 },
    other:               { min: 1, max: 200 },
    incidentDescription: { min: 1, max: 1000 },
    contactValue:        { min: 5, max: 120 },
    questionNumber:      { min: 0, max: 50 },
    // Taille maximale du payload JSON envoyé à submit_response, en octets.
    // Indicatif : on ne le vérifie pas ici (très loin d'être atteint).
    payloadBytes:        20000
  };

  // ------------------------------------------------------------------
  // 5. FORMATS DES COORDONNÉES (regex exactes du SQL)
  // WhatsApp et téléphone partagent le même format.
  // ------------------------------------------------------------------
  var patterns = {
    contactEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
    contactPhone: /^\+?[0-9][0-9 ().-]{6,24}$/
  };

  // ------------------------------------------------------------------
  // 6. VALEURS PAR DÉFAUT ET CHAMPS OBLIGATOIRES
  // ------------------------------------------------------------------
  var defaults = {
    recent_incident:   "unknown",
    recurrence:        "unknown",
    solution_interest: "unknown",
    source:            "direct_link"
  };

  var required = {
    // Imposés par le SQL (colonnes NOT NULL ou minimum de choix >= 1)
    sql: ["activity_type", "city", "role", "current_tools", "difficulty_areas"],
    // Choix du questionnaire (le SQL a une valeur par défaut)
    ux: ["recent_incident"]
  };

  // La ville est libre, mais la valeur exacte "other" est réservée par le
  // SQL (city = 'other' exige city_other, que nous n'utilisons pas).
  var reservedCity = "other";

  // ------------------------------------------------------------------
  // 7. SITUATION VÉCUE (Q6 à Q10)
  // ------------------------------------------------------------------
  var incidentFollowUp = {
    whenField: "recent_incident",
    whenValue: "yes",
    fields: ["incident_description", "incident_types", "resolution_methods", "recurrence"],
    // Si la condition n'est pas remplie : on envoie ces valeurs, et
    // incident_description est omise (le SQL l'ignorerait de toute façon).
    otherwise: { incident_types: [], resolution_methods: [], recurrence: "unknown" }
  };

  // ------------------------------------------------------------------
  // 8. RÈGLES D'INTERFACE UNIQUEMENT (le SQL ne les impose PAS)
  // Ne jamais supposer ces règles lors d'une analyse en base.
  // ------------------------------------------------------------------
  var ux = {
    exclusive: { incident_types: "prefer_not_to_say" },
    notExclusive: { resolution_methods: "not_resolved" },
    minChoicesWhenIncident: { incident_types: 1, resolution_methods: 1 }
  };

  // ------------------------------------------------------------------
  // 9. FONCTIONS UTILITAIRES
  // ------------------------------------------------------------------

  // Retire les blancs au début et à la fin ; renvoie "" si ce n'est pas
  // du texte.
  function clean(text) {
    return typeof text === "string" ? text.trim() : "";
  }

  // Compte les caractères comme PostgreSQL : un emoji compte pour 1.
  // (text.length le compterait pour 2.)
  function textLength(text) {
    return Array.from(text).length;
  }

  // Vérifie qu'un texte nettoyé a une longueur comprise entre min et max.
  function checkText(text, min, max) {
    var n = textLength(clean(text));
    if (n < min) { return min > 0 && n === 0 ? "required" : "too_short"; }
    if (n > max) { return "too_long"; }
    return null;
  }

  // Reproduit private.normalize_source du SQL :
  //   vide ou absente        -> "direct_link"
  //   exactement connue      -> telle quelle (sensible à la casse)
  //   toute autre valeur     -> "other"
  function normalizeSource(src) {
    if (src === null || src === undefined || String(src).trim() === "") {
      return "direct_link";
    }
    return values.source.indexOf(src) !== -1 ? src : "other";
  }

  // Q13 ("Comment avez-vous reçu ce lien ?") n'est posée que si la
  // session sera en "other" (source_other est alors obligatoire).
  function sourceNeedsDetail(src) {
    return normalizeSource(src) === "other";
  }

  // update_session_progress refuse tout ce qui n'est pas un entier de 0 à 50.
  function isValidQuestionNumber(n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n &&
           n >= limits.questionNumber.min && n <= limits.questionNumber.max;
  }

  // ------------------------------------------------------------------
  // 10. VALIDATIONS : renvoient null si c'est valide, sinon un CODE d'erreur
  // ------------------------------------------------------------------

  // Choix unique (activité, rôle, taille, récurrence...).
  // Pour un champ facultatif non répondu, ne pas appeler cette fonction.
  function validateSingle(field, value) {
    if (typeof value !== "string" || value === "") { return "required"; }
    if (values[field].indexOf(value) === -1) { return "not_allowed"; }
    return null;
  }

  // Choix multiples. minItems est facultatif : sert aux règles d'interface
  // (par exemple 1 pour incident_types quand une situation est racontée).
  function validateChoices(field, selected, minItems) {
    var rule = multi[field];
    var min = typeof minItems === "number" ? minItems : rule.min;
    var i;

    if (!Array.isArray(selected)) { return "not_allowed"; }

    for (i = 0; i < selected.length; i++) {
      if (values[field].indexOf(selected[i]) === -1) { return "not_allowed"; }
      if (selected.indexOf(selected[i]) !== i) { return "duplicate"; }
    }
    if (selected.length < min) { return "too_few"; }
    if (selected.length > rule.max) { return "too_many"; }
    if (rule.exclusive && selected.indexOf(rule.exclusive) !== -1 &&
        selected.length > 1) {
      return "exclusive_conflict";
    }
    return null;
  }

  // Q2 : ville libre, 1 à 100 caractères, sauf la valeur réservée "other".
  function validateCity(text) {
    var error = checkText(text, limits.city.min, limits.city.max);
    if (error) { return error; }
    if (clean(text) === reservedCity) { return "reserved_value"; }
    return null;
  }

  // Précisions "autre" : 1 à 200 caractères.
  function validateOtherText(text) {
    return checkText(text, limits.other.min, limits.other.max);
  }

  // Q7 : facultative. Vide = valide (elle sera omise ou envoyée à null).
  function validateIncidentDescription(text) {
    if (clean(text) === "") { return null; }
    return checkText(text, limits.incidentDescription.min,
                     limits.incidentDescription.max);
  }

  // Q15 : méthode + valeur. 5 à 120 caractères, puis format selon la méthode.
  function validateContact(method, value) {
    var v = clean(value);
    var pattern;

    if (values.contact_method.indexOf(method) === -1) { return "not_allowed"; }

    var error = checkText(v, limits.contactValue.min, limits.contactValue.max);
    if (error) { return error; }

    pattern = method === "email" ? patterns.contactEmail : patterns.contactPhone;
    if (!pattern.test(v)) { return "invalid_format"; }
    return null;
  }

  // ------------------------------------------------------------------
  // 11. EXPOSITION : tout est gelé pour qu'aucun autre fichier ne puisse
  // modifier le contrat par erreur.
  // ------------------------------------------------------------------
  function deepFreeze(obj) {
    Object.keys(obj).forEach(function (key) {
      var v = obj[key];
      if (v && typeof v === "object" && !(v instanceof RegExp)) {
        deepFreeze(v);
      }
    });
    return Object.freeze(obj);
  }

  return deepFreeze({
    values: values,
    multi: multi,
    otherFields: otherFields,
    limits: limits,
    patterns: patterns,
    defaults: defaults,
    required: required,
    incidentFollowUp: incidentFollowUp,
    ux: ux,
    clean: clean,
    textLength: textLength,
    normalizeSource: normalizeSource,
    sourceNeedsDetail: sourceNeedsDetail,
    isValidQuestionNumber: isValidQuestionNumber,
    validateSingle: validateSingle,
    validateChoices: validateChoices,
    validateCity: validateCity,
    validateOtherText: validateOtherText,
    validateIncidentDescription: validateIncidentDescription,
    validateContact: validateContact
  });
})();
