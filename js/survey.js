// js/survey.js
// Contrôleur du questionnaire Commerce Research.
//
// Rôle : afficher les questions, récupérer les réponses, gérer la navigation
// et les questions conditionnelles, puis envoyer la réponse finale.
//
// Ce fichier DIRIGE, il ne décide pas des règles :
//   - les règles de validation viennent de window.CR.contract (contract.js) ;
//   - les appels réseau passent par window.CR.api (api.js).
// Il ne contient ni clé, ni adresse de serveur, ni appel réseau direct.
//
// Les textes affichés au commerçant sont ici (section 3), avec les codes
// internes du contrat : le commerçant ne voit jamais un code.
//
// Sécurité : aucun HTML n'est construit à partir d'un texte saisi par
// l'utilisateur. Tout passe par createElement et textContent.

(function () {
  "use strict";

  // ======================================================================
  // 1. RÉFÉRENCES GLOBALES
  // ======================================================================
  var contract = window.CR && window.CR.contract;
  var api = window.CR && window.CR.api;

  // Les listes à choix multiples sont présentées dans un ordre mélangé (une
  // fois par visite) pour qu'aucun choix ne soit favorisé par sa position.
  // "Autre" et les options de sortie restent toujours en dernier.
  var SHUFFLE_CHOICES = true;

  var dom = {};        // éléments de index.html, remplis par init()
  var uidCounter = 0;  // pour fabriquer des identifiants uniques

  // ======================================================================
  // 2. ÉTAT DE L'APPLICATION (en mémoire pendant toute la visite)
  // ======================================================================
  var state = {
    sessionId: null,        // identifiant de session renvoyé par api.js
    src: null,              // valeur brute du paramètre ?src= du lien
    source: null,           // source normalisée (même règle que le SQL)
    current: null,          // identifiant de l'étape affichée
    answers: {},            // réponses (brouillons) par étape
    order: {},              // ordre des choix par étape (mélangé une fois)
    view: null,             // vue de l'étape affichée
    busy: false,            // true pendant un envoi : bloque les doubles clics
    finished: false,        // true après un envoi réussi
    progressSent: 0,        // dernière progression confirmée par le serveur
    progressPending: 0,     // dernière progression à envoyer
    progressInFlight: false
  };

  // ======================================================================
  // 3. TEXTES ET DÉFINITION DES QUESTIONS
  // ======================================================================
  var TEXT = {
    next: "Suivant",
    send: "Envoyer",
    back: "Retour",
    sending: "Envoi en cours…",
    sendingNote: "Envoi de vos réponses…",
    retry: "Réessayer",
    required: "Obligatoire",
    optional: "Facultatif",
    progress: function (index, total) { return "Question " + index + " sur " + total; },
    chosen: function (count, max) { return "Choisies : " + count + (max ? " sur " + max : ""); },
    progressFailed: "Connexion instable. Vos réponses sont conservées sur cette page.",
    fixAnswer: "Une réponse est à corriger avant l'envoi.",
    endTitle: "Merci pour votre temps.",
    endText: "Vos réponses nous aident à mieux comprendre le quotidien des commerçants. Vous pouvez fermer cette page.",
    fatal: "Un problème technique empêche d'afficher le questionnaire. Réessayez plus tard.",
    startFailed: "Le questionnaire n'a pas pu démarrer."
  };

  // Chaque étape : q = numéro de question du script validé (utilisé pour la
  // progression), type = single | multi | text | textarea | contact,
  // field = nom du champ du contrat, choices = [code, texte affiché].
  // tail = choix gardés en dernier quand l'ordre est mélangé.
  var STEPS = {
    activity: {
      q: 1, type: "single", field: "activity_type", required: true,
      title: "Quel est le type de votre activité ?",
      otherLabel: "Précisez votre activité",
      choices: [
        ["retail", "Vente au détail (boutique, magasin, étal)"],
        ["wholesale", "Vente en gros"],
        ["retail_wholesale", "Détail et gros"],
        ["distribution", "Distribution (je fournis des commerçants ou des points de vente)"],
        ["craft", "Artisanat (je fabrique ou je répare)"],
        ["production", "Production / fabrication"],
        ["food", "Alimentation (restauration, boissons, produits alimentaires)"],
        ["services", "Services"],
        ["construction", "Construction / bâtiment"],
        ["other", "Autre"]
      ]
    },
    city: {
      q: 2, type: "text", field: "city", required: true, limit: "city",
      title: "Dans quelle ville se trouve votre activité ?",
      help: "Écrivez le nom de la ville."
    },
    role: {
      q: 3, type: "single", field: "role", required: true,
      title: "Quel est votre rôle dans cette activité ?",
      otherLabel: "Précisez votre rôle",
      choices: [
        ["owner", "Je suis le propriétaire"],
        ["manager", "Je gère l'activité (gérant, responsable)"],
        ["sales", "Vendeur / vendeuse"],
        ["cashier", "Caissier / caissière"],
        ["stock_manager", "Responsable du stock, magasinier"],
        ["general_employee", "Employé polyvalent"],
        ["other", "Autre"]
      ]
    },
    team: {
      q: 4, type: "single", field: "team_size", required: false,
      title: "Combien de personnes travaillent dans votre activité, vous compris ?",
      choices: [
        ["1", "Juste moi"],
        ["2_5", "2 à 5 personnes"],
        ["6_10", "6 à 10 personnes"],
        ["11_20", "11 à 20 personnes"],
        ["20_plus", "Plus de 20 personnes"],
        ["prefer_not_to_say", "Je préfère ne pas répondre"]
      ]
    },
    tools: {
      q: 5, type: "multi", field: "current_tools", required: true,
      title: "Pour organiser et suivre votre activité au quotidien, qu'utilisez-vous ?",
      otherLabel: "Précisez",
      tail: ["none", "other"],
      choices: [
        ["paper", "Un cahier ou du papier"],
        ["whatsapp", "WhatsApp"],
        ["spreadsheet", "Excel ou un tableur"],
        ["management_software", "Un logiciel de gestion sur ordinateur"],
        ["mobile_app", "Une application sur téléphone"],
        ["cash_register", "Une caisse enregistreuse"],
        ["printed_documents", "Des documents imprimés (factures, bons)"],
        ["none", "Je n'utilise aucun outil particulier"],
        ["other", "Autre"]
      ]
    },
    incident: {
      q: 6, type: "single", field: "recent_incident", required: true,
      title: "Ces 3 derniers mois, y a-t-il eu une situation dans votre travail qui s'est mal passée ou qui vous a donné beaucoup de mal ?",
      choices: [
        ["yes", "Oui"],
        ["no", "Non"],
        ["unknown", "Je ne me souviens pas"]
      ]
    },
    description: {
      q: 7, type: "textarea", field: "incident_description", required: false,
      limit: "incidentDescription", counter: true,
      title: "Racontez-nous, avec vos mots, la dernière fois que cela s'est produit. Que s'est-il passé ? Qu'avez-vous fait ensuite ?",
      help: "Quelques phrases suffisent. Vous pouvez utiliser la dictée vocale de votre téléphone. N'écrivez pas de noms de personnes."
    },
    types: {
      q: 8, type: "multi", field: "incident_types", required: true,
      title: "Cette situation concernait surtout quoi ?",
      otherLabel: "Précisez",
      tail: ["other", "prefer_not_to_say"],
      choices: [
        ["product_missing", "Un produit manquait ou n'était pas disponible"],
        ["order_sale", "Un problème sur une commande ou une vente"],
        ["payment_cash", "Un problème de paiement ou d'argent en caisse"],
        ["delivery", "Un problème de livraison"],
        ["supplier", "Un problème avec un fournisseur"],
        ["coordination", "Un problème d'organisation entre les personnes"],
        ["information", "Une information introuvable ou fausse"],
        ["error_omission", "Une erreur ou un oubli"],
        ["time_loss", "Beaucoup de temps perdu"],
        ["money_loss", "De l'argent perdu"],
        ["other", "Autre"],
        ["prefer_not_to_say", "Je préfère ne pas préciser"]
      ]
    },
    resolution: {
      q: 9, type: "multi", field: "resolution_methods", required: true,
      title: "Qu'avez-vous fait pour régler cette situation ?",
      otherLabel: "Précisez",
      tail: ["not_resolved", "other"],
      choices: [
        ["manual_correction", "J'ai corrigé à la main"],
        ["phone_call", "J'ai téléphoné"],
        ["whatsapp", "J'ai écrit sur WhatsApp"],
        ["paper_check", "J'ai vérifié dans mes papiers ou cahiers"],
        ["spreadsheet", "J'ai vérifié dans un fichier (Excel, tableur)"],
        ["software", "J'ai utilisé un logiciel ou une application"],
        ["redo_operation", "J'ai refait l'opération"],
        ["wait", "J'ai attendu"],
        ["not_resolved", "Ce n'est pas encore réglé"],
        ["other", "Autre"]
      ]
    },
    recurrence: {
      q: 10, type: "single", field: "recurrence", required: true,
      title: "Pensez-vous que cette situation peut se reproduire ?",
      choices: [
        ["yes_probably", "Oui, probablement"],
        ["yes_rarely", "Oui, mais rarement"],
        ["no_resolved", "Non, c'est réglé"],
        ["unknown", "Je ne sais pas"]
      ]
    },
    difficulty: {
      q: 11, type: "multi", field: "difficulty_areas", required: true,
      title: "Dans votre travail au quotidien, y a-t-il des sujets qui vous demandent beaucoup d'efforts ou vous posent des soucis ? Si oui, lesquels ?",
      otherLabel: "Précisez",
      tail: ["other", "none"],
      choices: [
        ["stock", "Le stock"],
        ["sales_orders", "Les ventes et les commandes"],
        ["payments_cash", "Les paiements et l'argent en caisse"],
        ["delivery", "Les livraisons"],
        ["suppliers", "Les fournisseurs"],
        ["employees_coordination", "L'organisation entre les personnes qui travaillent avec moi"],
        ["information_retrieval", "Retrouver une information (prix, historique, client…)"],
        ["errors_omissions", "Les erreurs et les oublis"],
        ["activity_visibility", "Savoir où en est mon activité (résultats, bénéfices)"],
        ["time_management", "La gestion de mon temps"],
        ["other", "Autre"],
        ["none", "Non, aucun sujet en particulier"]
      ]
    },
    interest: {
      q: 12, type: "single", field: "solution_interest", required: false,
      title: "Si, un jour, un outil était conçu pour aider sur ce type de difficultés, aimeriez-vous en savoir plus ?",
      choices: [
        ["yes", "Oui"],
        ["maybe", "Peut-être"],
        ["not_really", "Pas vraiment"],
        ["unknown", "Je ne sais pas"]
      ]
    },
    sourceDetail: {
      q: 13, type: "text", field: "source_other", required: true, limit: "other",
      title: "Par quel moyen avez-vous reçu ce lien ?"
    },
    contact: {
      q: 14, type: "contact", required: false, limit: "contactValue",
      title: "Accepteriez-vous d'être recontacté(e) pour en parler quelques minutes ?",
      help: "Vos coordonnées servent uniquement à cela et sont enregistrées séparément de vos réponses.",
      consentChoices: [
        ["yes", "Oui, vous pouvez me recontacter"],
        ["no", "Non merci"]
      ],
      methodTitle: "Comment préférez-vous être contacté(e) ?",
      methodChoices: [
        ["whatsapp", "WhatsApp"],
        ["phone", "Téléphone"],
        ["email", "Email"]
      ],
      valueLabels: {
        whatsapp: "Votre numéro WhatsApp",
        phone: "Votre numéro de téléphone",
        email: "Votre adresse email",
        none: "Votre numéro ou votre adresse email"
      }
    }
  };

  // ======================================================================
  // 4. FONCTIONS DOM (le texte saisi n'est jamais interprété comme du HTML)
  // ======================================================================
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) { fn(list[i], i); }
  }

  function uid(prefix) {
    uidCounter += 1;
    return prefix + "-" + uidCounter;
  }

  function isEmpty(value) {
    return value === null || value === undefined || value === "";
  }

  // Un contrôle garde dans data-help-id l'identifiant de son aide, pour que
  // aria-describedby puisse être reconstruit après l'effacement d'une erreur.
  function describeBy(control, helpId) {
    if (helpId) {
      control.setAttribute("data-help-id", helpId);
      control.setAttribute("aria-describedby", helpId);
    }
  }

  function makeBadge(required) {
    return el("span", required ? "badge badge--required" : "badge",
              required ? TEXT.required : TEXT.optional);
  }

  // Cadre d'une question : titre, étiquette Obligatoire/Facultatif, aide.
  // Un groupe de choix utilise fieldset + legend ; un champ utilise label.
  function makeShell(def, asGroup) {
    var root = el(asGroup ? "fieldset" : "div", "question");
    var title = el(asGroup ? "legend" : "label", "question__title", def.title);
    var meta = el("div", "question__meta");
    var helpText = typeof def.help === "function" ? def.help() : def.help;
    var helpId = null;

    meta.appendChild(makeBadge(def.required));
    root.appendChild(title);
    root.appendChild(meta);
    if (helpText) {
      var help = el("p", "question__help", helpText);
      helpId = uid("help");
      help.id = helpId;
      root.appendChild(help);
    }
    return { root: root, title: title, helpId: helpId };
  }

  function makeChoice(type, name, code, label, checked) {
  var wrap = el("label", "choice");
  var input = document.createElement("input");
  var indicator = el("span", "choice__indicator", "✓");

  input.type = type;
  input.name = name;
  input.value = code;
  input.checked = !!checked;

  wrap.appendChild(input);
  wrap.appendChild(el("span", "choice__text", label));
  wrap.appendChild(indicator);

  if (checked) {
    wrap.classList.add("is-selected");
  }

  return {
    code: code,
    wrap: wrap,
    input: input
  };
  }
  function syncSelected(items) {
    each(items, function (item) {
      item.wrap.classList.toggle("is-selected", item.input.checked);
    });
  }

  function makeTextInput(id, multiline) {
    var input = document.createElement(multiline ? "textarea" : "input");
    if (!multiline) { input.type = "text"; }
    input.className = "input";
    input.id = id;
    input.setAttribute("autocomplete", "off");
    if (multiline) { input.rows = 6; }
    return input;
  }

  // Champ "Précisez" qui n'apparaît que si "Autre" est choisi.
  function makeOtherField(def, value) {
    var box = el("div", "conditional");
    var field = el("div", "field");
    var id = uid("other");
    var label = el("label", "field__label", def.otherLabel);
    var input = makeTextInput(id, false);

    label.setAttribute("for", id);
    input.value = value || "";
    field.appendChild(label);
    field.appendChild(input);
    box.appendChild(field);
    return { box: box, field: field, input: input };
  }

  // ======================================================================
  // 5. AFFICHAGE DES ERREURS (texte + icône + attributs d'accessibilité)
  // ======================================================================
  function addError(host, anchor, controls, message) {
    var error = el("p", "error-text", message);
    error.id = uid("err");
    error.setAttribute("role", "alert");
    anchor.parentNode.insertBefore(error, anchor.nextSibling);
    each(controls, function (control) {
      var base = control.getAttribute("data-help-id") || "";
      control.setAttribute("aria-invalid", "true");
      control.setAttribute("aria-describedby", (base + " " + error.id).trim());
    });
    host.classList.add("has-error");
  }

  function clearErrors(root) {
    var errors = root.querySelectorAll(".error-text");
    var invalid = root.querySelectorAll("[aria-invalid]");
    var marked = root.querySelectorAll(".has-error");

    each(errors, function (node) { node.parentNode.removeChild(node); });
    each(invalid, function (node) {
      var base = node.getAttribute("data-help-id");
      node.removeAttribute("aria-invalid");
      if (base) { node.setAttribute("aria-describedby", base); }
      else { node.removeAttribute("aria-describedby"); }
    });
    each(marked, function (node) { node.classList.remove("has-error"); });
    root.classList.remove("has-error");
  }

  // La barre du bouton est collée en bas de l'écran : si le message d'erreur
  // passe dessous, on fait défiler juste assez pour qu'il reste visible.
  function revealAboveActions(node) {
    var barTop = dom.actions && !dom.actions.hidden
      ? dom.actions.getBoundingClientRect().top : window.innerHeight;
    var overlap = node.getBoundingClientRect().bottom + 8 - barTop;
    if (overlap > 0) { window.scrollBy(0, overlap); }
  }

  function focusFirstInvalid(root) {
    var node = root.querySelector('[aria-invalid="true"]');
    var error = root.querySelector(".error-text");
    var target;
    if (!node) { return; }
    if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") { target = node; }
    else { target = node.querySelector("input:not([disabled])"); }
    if (target) { target.focus(); }
    if (error) { revealAboveActions(error); }
  }

  // ======================================================================
  // 6. RENDU DES QUESTIONS
  // Chaque fonction renvoie une "vue" : { root, read(), showErrors() }
  // ======================================================================

  function minChoices(def) {
    var rule = contract.multi[def.field];
    var ux = contract.ux.minChoicesWhenIncident[def.field];
    return typeof ux === "number" ? ux : rule.min;
  }

  function multiHelp(def) {
    var max = contract.multi[def.field].max;
    if (max >= def.choices.length) { return "Plusieurs réponses possibles."; }
    return "Vous pouvez choisir " + max + " réponse" + (max > 1 ? "s" : "") + " au maximum.";
  }

  // Ordre des choix : mélangé une fois par visite (listes à choix multiples),
  // avec les choix "de queue" toujours à la fin.
  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function prepareOrders() {
    Object.keys(STEPS).forEach(function (id) {
      var def = STEPS[id];
      var tail = def.tail || [];
      var head;
      if (def.type !== "multi") { return; }
      head = def.choices.map(function (pair) { return pair[0]; })
        .filter(function (code) { return tail.indexOf(code) === -1; });
      if (SHUFFLE_CHOICES) { shuffle(head); }
      state.order[id] = head.concat(tail);
    });
  }

  function orderedChoices(id) {
    var def = STEPS[id];
    var labels = {};
    if (!state.order[id]) { return def.choices; }
    def.choices.forEach(function (pair) { labels[pair[0]] = pair[1]; });
    return state.order[id].map(function (code) { return [code, labels[code]]; });
  }

  function isOtherSelected(def, data) {
    if (def.type === "multi") { return data.values.indexOf("other") !== -1; }
    return data.value === "other";
  }

  // ---- Choix unique (boutons radio) ----
  function buildSingle(def, data, id) {
    var shell = makeShell(def, true);
    var group = el("div", "choices");
    var items = [];
    var other = def.otherLabel ? makeOtherField(def, data.other) : null;

    group.setAttribute("role", "radiogroup");
    describeBy(group, shell.helpId);
    shell.root.appendChild(group);

    orderedChoices(id).forEach(function (pair) {
      var item = makeChoice("radio", def.field, pair[0], pair[1], data.value === pair[0]);
      items.push(item);
      group.appendChild(item.wrap);
    });
    if (other) { shell.root.appendChild(other.box); }

    function selectedCode() {
      var found = null;
      each(items, function (item) { if (item.input.checked) { found = item.code; } });
      return found;
    }

    function refresh() {
      syncSelected(items);
      if (other) { other.box.hidden = selectedCode() !== "other"; }
    }

    each(items, function (item) {
      item.input.addEventListener("change", function () {
        refresh();
        clearErrors(shell.root);
      });
    });
    if (other) { other.input.addEventListener("input", function () { clearErrors(shell.root); }); }
    refresh();

    return {
      root: shell.root,
      read: function () {
        return { value: selectedCode(), other: other ? other.input.value : "" };
      },
      showErrors: function (errors) {
        clearErrors(shell.root);
        if (errors.main) { addError(shell.root, group, [group], errorText(def, "main", errors.main)); }
        if (errors.other) { addError(shell.root, other.input, [other.input], errorText(def, "other", errors.other)); }
        focusFirstInvalid(shell.root);
      }
    };
  }

  // ---- Choix multiples (cases à cocher) ----
  function buildMulti(def, data, id) {
    var rule = contract.multi[def.field];
    var exclusive = rule.exclusive || (contract.ux.exclusive && contract.ux.exclusive[def.field]) || null;
    var shell;
    var group = el("div", "choices");
    var status = el("p", "question__status");
    var items = [];
    var other = def.otherLabel ? makeOtherField(def, data.other) : null;

    shell = makeShell({ title: def.title, required: def.required, help: multiHelp(def) }, true);
    group.setAttribute("role", "group");
    describeBy(group, shell.helpId);
    status.setAttribute("aria-live", "polite");
    shell.root.appendChild(group);
    shell.root.appendChild(status);

    orderedChoices(id).forEach(function (pair) {
      var item = makeChoice("checkbox", def.field, pair[0], pair[1], data.values.indexOf(pair[0]) !== -1);
      items.push(item);
      group.appendChild(item.wrap);
    });
    if (other) { shell.root.appendChild(other.box); }

    function selectedCodes() {
      var list = [];
      each(items, function (item) { if (item.input.checked) { list.push(item.code); } });
      return list;
    }

    // Met à jour : cartes sélectionnées, maximum atteint, compteur, champ "Précisez"
    function refresh() {
      var count = selectedCodes().length;
      each(items, function (item) {
        var locked = count >= rule.max && !item.input.checked && item.code !== exclusive;
        item.input.disabled = locked;
        item.wrap.classList.toggle("is-disabled", locked);
      });
      syncSelected(items);
      status.textContent = count > 0
        ? TEXT.chosen(count, rule.max < items.length ? rule.max : null) : "";
      if (other) { other.box.hidden = selectedCodes().indexOf("other") === -1; }
    }

    // Choix exclusif : cocher "aucun" décoche le reste, et inversement.
    function onChange(changed) {
      if (changed.input.checked && exclusive) {
        each(items, function (item) {
          if (changed.code === exclusive && item !== changed) { item.input.checked = false; }
          if (changed.code !== exclusive && item.code === exclusive) { item.input.checked = false; }
        });
      }
      refresh();
      clearErrors(shell.root);
    }

    each(items, function (item) {
      item.input.addEventListener("change", function () { onChange(item); });
    });
    if (other) { other.input.addEventListener("input", function () { clearErrors(shell.root); }); }
    refresh();

    return {
      root: shell.root,
      read: function () {
        return { values: selectedCodes(), other: other ? other.input.value : "" };
      },
      showErrors: function (errors) {
        clearErrors(shell.root);
        if (errors.main) { addError(shell.root, status, [group], errorText(def, "main", errors.main)); }
        if (errors.other) { addError(shell.root, other.input, [other.input], errorText(def, "other", errors.other)); }
        focusFirstInvalid(shell.root);
      }
    };
  }

  // ---- Champ texte court ou long ----
  function buildText(def, data) {
    var shell = makeShell(def, false);
    var field = el("div", "field");
    var id = uid("text");
    var input = makeTextInput(id, def.type === "textarea");
    var counter = null;

    shell.title.setAttribute("for", id);
    describeBy(input, shell.helpId);
    input.value = data.text || "";
    field.appendChild(input);

    function updateCounter() {
      var max = contract.limits[def.limit].max;
      counter.textContent = contract.textLength(input.value) + " / " + max;
      counter.classList.toggle("is-over", contract.textLength(contract.clean(input.value)) > max);
    }

    if (def.counter) {
      counter = el("p", "field__counter");
      field.appendChild(counter);
      updateCounter();
    }
    shell.root.appendChild(field);

    input.addEventListener("input", function () {
      clearErrors(shell.root);
      if (counter) { updateCounter(); }
    });

    return {
      root: shell.root,
      read: function () { return { text: input.value }; },
      showErrors: function (errors) {
        clearErrors(shell.root);
        if (errors.main) { addError(shell.root, input, [input], errorText(def, "main", errors.main)); }
        focusFirstInvalid(shell.root);
      }
    };
  }

  // ---- Consentement et coordonnées (Q14 et Q15 sur le même écran) ----
  function buildContact(def, data) {
    var root = el("div", "contact-step");
    var consentShell = makeShell({ title: def.title, required: false, help: def.help }, true);
    var consentGroup = el("div", "choices");
    var consentItems = [];
    var box = el("div", "conditional");
    var methodShell = makeShell({ title: def.methodTitle, required: true }, true);
    var methodGroup = el("div", "choices");
    var methodItems = [];
    var field = el("div", "field");
    var valueId = uid("contact");
    var valueLabel = el("label", "field__label");
    var valueInput = makeTextInput(valueId, false);

    consentGroup.setAttribute("role", "radiogroup");
    methodGroup.setAttribute("role", "radiogroup");
    describeBy(consentGroup, consentShell.helpId);

    def.consentChoices.forEach(function (pair) {
      var checked = (pair[0] === "yes" && data.consent === true) || (pair[0] === "no" && data.consent === false);
      var item = makeChoice("radio", "consent", pair[0], pair[1], checked);
      consentItems.push(item);
      consentGroup.appendChild(item.wrap);
    });
    def.methodChoices.forEach(function (pair) {
      var item = makeChoice("radio", "contact_method", pair[0], pair[1], data.method === pair[0]);
      methodItems.push(item);
      methodGroup.appendChild(item.wrap);
    });

    valueLabel.setAttribute("for", valueId);
    valueInput.value = data.value || "";
    field.appendChild(valueLabel);
    field.appendChild(valueInput);
    methodShell.root.appendChild(methodGroup);
    consentShell.root.appendChild(consentGroup);
    box.appendChild(methodShell.root);
    box.appendChild(field);
    root.appendChild(consentShell.root);
    root.appendChild(box);

    function consentValue() {
      var value = null;
      each(consentItems, function (item) {
        if (item.input.checked) { value = item.code === "yes"; }
      });
      return value;
    }

    function methodValue() {
      var value = null;
      each(methodItems, function (item) { if (item.input.checked) { value = item.code; } });
      return value;
    }

    // Le type du champ suit le moyen choisi (clavier adapté sur téléphone).
    function refresh() {
      var method = methodValue();
      syncSelected(consentItems);
      syncSelected(methodItems);
      box.hidden = consentValue() !== true;
      valueLabel.textContent = def.valueLabels[method || "none"];
      valueInput.type = method === "email" ? "email" : "tel";
      valueInput.setAttribute("inputmode", method === "email" ? "email" : "tel");
      valueInput.setAttribute("autocomplete", method === "email" ? "email" : "tel");
    }

    each(consentItems.concat(methodItems), function (item) {
      item.input.addEventListener("change", function () {
        refresh();
        clearErrors(root);
      });
    });
    valueInput.addEventListener("input", function () { clearErrors(root); });
    refresh();

    return {
      root: root,
      read: function () {
        return { consent: consentValue(), method: methodValue(), value: valueInput.value };
      },
      showErrors: function (errors) {
        var current = { method: methodValue() };
        clearErrors(root);
        if (errors.method) {
          addError(methodShell.root, methodGroup, [methodGroup], errorText(def, "method", errors.method, current));
        }
        if (errors.value) {
          addError(field, valueInput, [valueInput], errorText(def, "value", errors.value, current));
        }
        focusFirstInvalid(root);
      }
    };
  }

  function buildView(id) {
    var def = STEPS[id];
    var data = state.answers[id] || emptyData(def);
    if (def.type === "single") { return buildSingle(def, data, id); }
    if (def.type === "multi") { return buildMulti(def, data, id); }
    if (def.type === "contact") { return buildContact(def, data); }
    return buildText(def, data);
  }

  // ======================================================================
  // 7. RÉPONSES ET VALIDATION (les règles sont dans contract.js)
  // ======================================================================
  function emptyData(def) {
    if (def.type === "single") { return { value: null, other: "" }; }
    if (def.type === "multi") { return { values: [], other: "" }; }
    if (def.type === "contact") { return { consent: null, method: null, value: "" }; }
    return { text: "" };
  }

  // Le parcours dépend des réponses : l'incident (Q7 à Q10) seulement si
  // Q6 = oui, et la source (Q13) seulement si la source est "other".
  function isIncident() {
    var data = state.answers.incident;
    return !!data && data.value === contract.incidentFollowUp.whenValue;
  }

  function buildPath() {
    var path = ["activity", "city", "role", "team", "tools", "incident"];
    if (isIncident()) { path = path.concat(["description", "types", "resolution", "recurrence"]); }
    path.push("difficulty", "interest");
    if (contract.sourceNeedsDetail(state.src)) { path.push("sourceDetail"); }
    path.push("contact");
    return path;
  }

  // Renvoie un objet d'erreurs { main, other, method, value } (codes du contrat).
  function validateStep(id, data) {
    var def = STEPS[id];
    var errors = {};
    var code;

    if (def.type === "single") {
      if (isEmpty(data.value)) {
        if (def.required) { errors.main = "required"; }
      } else {
        code = contract.validateSingle(def.field, data.value);
        if (code) { errors.main = code; }
        else if (isOtherSelected(def, data)) {
          code = contract.validateOtherText(data.other);
          if (code) { errors.other = code; }
        }
      }
    } else if (def.type === "multi") {
      code = contract.validateChoices(def.field, data.values, minChoices(def));
      if (code) { errors.main = code; }
      else if (isOtherSelected(def, data)) {
        code = contract.validateOtherText(data.other);
        if (code) { errors.other = code; }
      }
    } else if (def.type === "text") {
      code = def.field === "city" ? contract.validateCity(data.text) : contract.validateOtherText(data.text);
      if (code) { errors.main = code; }
    } else if (def.type === "textarea") {
      code = contract.validateIncidentDescription(data.text);
      if (code) { errors.main = code; }
    } else if (def.type === "contact" && data.consent === true) {
      code = contract.validateSingle("contact_method", data.method);
      if (code) { errors.method = "required"; }
      else {
        code = contract.validateContact(data.method, data.value);
        if (code) { errors.value = code; }
      }
    }
    return errors;
  }

  function hasErrors(errors) {
    return Object.keys(errors).length > 0;
  }

  function limitFor(def, key) {
    if (key === "other") { return contract.limits.other.max; }
    return contract.limits[def.limit || "other"].max;
  }

  // Transforme un code d'erreur du contrat en phrase simple pour l'utilisateur.
  function errorText(def, key, code, extra) {
    var max;
    var min;
    switch (code) {
      case "required":
        if (def.type === "text" || def.type === "textarea") { return "Ce champ est obligatoire."; }
        if (def.type === "contact") {
          return key === "method" ? "Choisissez un moyen de contact." : "Écrivez votre numéro ou votre adresse email.";
        }
        return key === "other" ? "Ce champ est obligatoire." : "Choisissez une réponse.";
      case "too_few":
        min = minChoices(def);
        return min > 1 ? "Choisissez au moins " + min + " réponses." : "Choisissez au moins une réponse.";
      case "too_many":
        max = contract.multi[def.field].max;
        return "Vous pouvez choisir " + max + " réponse" + (max > 1 ? "s" : "") + " au maximum.";
      case "exclusive_conflict":
        return "Ce choix ne peut pas être combiné avec les autres.";
      case "too_long":
        return "Ce texte est trop long : " + limitFor(def, key) + " caractères au maximum.";
      case "too_short":
        return key === "other" ? "Ce texte est trop court." : "Cette valeur est trop courte.";
      case "reserved_value":
        return "Écrivez le nom de votre ville.";
      case "invalid_format":
        return extra && extra.method === "email"
          ? "Écrivez une adresse email valide, par exemple nom@exemple.com."
          : "Écrivez un numéro valide : chiffres et espaces, avec un + possible au début.";
      default:
        return "Cette réponse n'est pas valide. Merci de la vérifier.";
    }
  }

  // Ajoute à "payload" les champs d'une étape, sous les noms du contrat.
  function addAnswer(payload, id) {
    var def = STEPS[id];
    var data = state.answers[id] || emptyData(def);
    var otherField = contract.otherFields[def.field];
    var text;

    if (def.type === "single") {
      if (isEmpty(data.value)) { return; }
      payload[def.field] = data.value;
      if (data.value === "other" && otherField) { payload[otherField] = contract.clean(data.other); }
    } else if (def.type === "multi") {
      payload[def.field] = data.values.slice();
      if (data.values.indexOf("other") !== -1 && otherField) { payload[otherField] = contract.clean(data.other); }
    } else if (def.type === "text") {
      payload[def.field] = contract.clean(data.text);
    } else if (def.type === "textarea") {
      text = contract.clean(data.text);
      if (text !== "") { payload[def.field] = text; }
    }
  }

  // Le champ "source" n'est JAMAIS envoyé : la source de la session (créée
  // au démarrage) est la seule qui compte. Seule la précision source_other
  // est envoyée, et seulement quand la session est "other".
  function buildPayload() {
    var payload = {};
    var follow = contract.incidentFollowUp.otherwise;

    each(buildPath(), function (id) {
      if (STEPS[id].type !== "contact") { addAnswer(payload, id); }
    });
    if (!isIncident()) {
      Object.keys(follow).forEach(function (key) {
        payload[key] = follow[key] instanceof Array ? follow[key].slice() : follow[key];
      });
    }
    return payload;
  }

  // Le contact n'est transmis que si le consentement est réellement donné.
  function buildContactObject() {
    var data = state.answers.contact || emptyData(STEPS.contact);
    if (data.consent !== true) { return null; }
    return {
      consent: true,
      contact_method: data.method,
      contact_value: contract.clean(data.value)
    };
  }

  // Dernière validation avant l'envoi : revérifie toutes les étapes du parcours.
  function findInvalidStep() {
    var path = buildPath();
    for (var i = 0; i < path.length; i++) {
      var data = state.answers[path[i]] || emptyData(STEPS[path[i]]);
      var errors = validateStep(path[i], data);
      if (hasErrors(errors)) { return { id: path[i], errors: errors }; }
    }
    return null;
  }

  // ======================================================================
  // 8. NAVIGATION ET AFFICHAGE DES ÉCRANS
  // ======================================================================
  function showMessage(text, type) {
    dom.message.textContent = text;
    if (type === "error" || type === "success") { dom.message.setAttribute("data-type", type); }
    else { dom.message.removeAttribute("data-type"); }
    dom.message.hidden = false;
  }

  function clearMessage() {
    dom.message.hidden = true;
    dom.message.textContent = "";
    dom.message.removeAttribute("data-type");
  }

  function neighbour(offset) {
    var path = buildPath();
    var index = path.indexOf(state.current) + offset;
    return index >= 0 && index < path.length ? path[index] : null;
  }

  function updateProgressUi() {
    var path = buildPath();
    var index = path.indexOf(state.current);
    dom.progressLabel.textContent = TEXT.progress(index + 1, path.length);
    dom.progressBar.value = Math.round((index / path.length) * 100);
    dom.progress.hidden = false;
  }

  function updateButtons() {
    var path = buildPath();
    var index = path.indexOf(state.current);
    dom.actions.hidden = false;
    dom.next.hidden = false;
    dom.next.textContent = index === path.length - 1 ? TEXT.send : TEXT.next;
    dom.back.hidden = index <= 0;
  }

  function setBusy(flag) {
    state.busy = flag;
    dom.next.disabled = flag;
    dom.back.disabled = flag;
    dom.container.setAttribute("aria-busy", flag ? "true" : "false");
  }

  function renderStep() {
    clearNode(dom.container);
    state.view = buildView(state.current);
    dom.container.appendChild(state.view.root);
    updateProgressUi();
    updateButtons();
    clearMessage();
    dom.container.focus();
    window.scrollTo(0, 0);
  }

  function handleNext(event) {
    var data;
    var errors;
    var next;
    if (event) { event.preventDefault(); }
    if (state.busy || state.finished || !state.view) { return; }

    data = state.view.read();
    errors = validateStep(state.current, data);
    state.answers[state.current] = data;           // brouillon conservé même si invalide
    if (hasErrors(errors)) {
      state.view.showErrors(errors);
      return;
    }

    next = neighbour(1);
    if (next === null) { submit(); return; }
    queueProgress(STEPS[state.current].q);
    state.current = next;
    renderStep();
  }

  function handleBack() {
    var previous;
    if (state.busy || state.finished || !state.view) { return; }
    state.answers[state.current] = state.view.read();   // sans validation
    previous = neighbour(-1);
    if (previous === null) { return; }
    state.current = previous;
    renderStep();
  }

  function showEnd() {
  var screen = el("div", "end-screen");
  var icon = el("span", "end-screen__icon", "✓");

  state.finished = true;

  icon.setAttribute("aria-hidden", "true");

  screen.appendChild(icon);
  screen.appendChild(
    el("h2", "end-screen__title", TEXT.endTitle)
  );
  screen.appendChild(
    el("p", "end-screen__text", TEXT.endText)
  );

  clearNode(dom.container);
  dom.container.appendChild(screen);

  dom.progress.hidden = true;
  dom.next.hidden = true;
  dom.back.hidden = true;
  dom.actions.hidden = true;

  clearMessage();
  dom.container.focus();
  }

  // ======================================================================
  // 9. PROGRESSION (jamais bloquante)
  // La valeur envoyée est la dernière question dont la réponse est valide.
  // ======================================================================
  function queueProgress(questionNumber) {
    if (!contract.isValidQuestionNumber(questionNumber)) { return; }
    if (questionNumber > state.progressPending) { state.progressPending = questionNumber; }
    flushProgress();
  }

  function flushProgress() {
    var value;
    if (state.progressInFlight || !state.sessionId || state.progressPending <= state.progressSent) { return; }
    value = state.progressPending;
    state.progressInFlight = true;
    api.updateProgress(state.sessionId, value).then(function (result) {
      state.progressInFlight = false;
      if (result.ok) {
        state.progressSent = value;
        flushProgress();                 // une valeur plus récente est peut-être en attente
        return;
      }
      reportError("progress", result.error);
      // La réponse reste en mémoire ; le prochain envoi de progression réessaiera.
      if (!state.finished && !state.busy) { showMessage(TEXT.progressFailed, "info"); }
    });
  }

  // ======================================================================
  // 10. SOUMISSION FINALE
  // ======================================================================
  function goToInvalid(problem) {
    state.current = problem.id;
    renderStep();
    state.view.showErrors(problem.errors);
    showMessage(TEXT.fixAnswer, "error");
  }

  function submit() {
    var problem = findInvalidStep();
    if (problem) { goToInvalid(problem); return; }

    setBusy(true);
    dom.next.textContent = TEXT.sending;
    showMessage(TEXT.sendingNote, "info");

    api.submitResponse(buildPayload(), buildContactObject(), state.sessionId).then(function (result) {
      setBusy(false);
      if (result.ok) { showEnd(); return; }
      reportError("submit", result.error);
      updateButtons();
      if (result.error.retryable) { dom.next.textContent = TEXT.retry; }
      showMessage(messageForApiError(result.error, "submit"), "error");
    });
  }

  // ======================================================================
  // 11. GESTION DES ERREURS RÉSEAU
  // ======================================================================
  function messageForApiError(error, context) {
    if (error.kind === "network") { return "Vérifiez votre connexion et réessayez."; }
    if (error.kind === "timeout") { return "La connexion prend trop de temps. Réessayez."; }
    if (error.kind === "http") {
      if (error.retryable) { return "Le service est momentanément indisponible. Réessayez dans un instant."; }
      if (error.status === 401 || error.status === 403) { return "Le service n'est pas disponible pour le moment. Réessayez plus tard."; }
      if (context === "submit") { return "Vos réponses n'ont pas pu être enregistrées. Vérifiez-les, puis réessayez."; }
    }
    return "Un problème technique est survenu. Réessayez dans un instant.";
  }

  // Trace pour le développeur : jamais de réponse du commerçant, seulement
  // le contexte et la nature de l'erreur.
  function reportError(context, error) {
    if (window.console && typeof console.warn === "function") {
      console.warn("[CR]", context, error.kind, error.status, error.code);
    }
  }

  // ======================================================================
  // 12. INITIALISATION
  // ======================================================================
  function showScreenMessage(text, retryAction) {
    var note = el("div", "note");
    clearNode(dom.container);
    note.appendChild(el("p", null, text));
    dom.container.appendChild(note);
    if (retryAction) {
      var button = el("button", "button", TEXT.retry);
      button.type = "button";
      button.addEventListener("click", retryAction);
      dom.container.appendChild(button);
    }
    dom.loading.hidden = true;
    dom.progress.hidden = true;
    dom.next.hidden = true;
    dom.back.hidden = true;
    dom.actions.hidden = true;
    dom.container.focus();
  }

  function fatal(problems) {
    if (problems && window.console && typeof console.error === "function") {
      console.error("[CR] définitions du questionnaire incohérentes :", problems.join(" | "));
    }
    if (dom.container) { showScreenMessage(TEXT.fatal, null); }
    else if (document.body) { document.body.appendChild(el("p", null, TEXT.fatal)); }
  }

  // Vérifie que les textes de ce fichier couvrent exactement les codes du contrat.
  function checkDefinitions() {
    var problems = [];

    function compare(label, codes, allowed) {
      each(allowed, function (code) {
        if (codes.indexOf(code) === -1) { problems.push(label + " : choix manquant " + code); }
      });
      each(codes, function (code) {
        if (allowed.indexOf(code) === -1) { problems.push(label + " : code inconnu " + code); }
      });
    }

    Object.keys(STEPS).forEach(function (id) {
      var def = STEPS[id];
      var codes;
      if (def.choices && contract.values[def.field]) {
        codes = def.choices.map(function (pair) { return pair[0]; });
        compare(id, codes, contract.values[def.field]);
        each(def.tail || [], function (code) {
          if (codes.indexOf(code) === -1) { problems.push(id + " : tail inconnu " + code); }
        });
      }
    });
    compare("contact", STEPS.contact.methodChoices.map(function (pair) { return pair[0]; }), contract.values.contact_method);

    each(contract.required.sql.concat(contract.required.ux), function (field) {
      var found = false;
      Object.keys(STEPS).forEach(function (id) {
        if (STEPS[id].field === field) { found = true; if (STEPS[id].required !== true) { problems.push(id + " : devrait être obligatoire"); } }
      });
      if (!found) { problems.push("aucune étape pour le champ " + field); }
    });
    return problems;
  }

  function readSource() {
    try {
      state.src = new URLSearchParams(window.location.search).get("src");
    } catch (e) {
      state.src = null;
    }
    // Même règle que le SQL : sert à savoir si la question Q13 est nécessaire.
    state.source = contract.normalizeSource(state.src);
  }

  function startSession() {
    dom.loading.hidden = false;
    api.startSession(state.src).then(function (result) {
      if (!result.ok) {
        reportError("start", result.error);
        showScreenMessage(TEXT.startFailed + " " + messageForApiError(result.error, "start"), startSession);
        return;
      }
      state.sessionId = result.data;
      state.current = buildPath()[0];
      dom.loading.hidden = true;
      renderStep();
    });
  }

  function collectDom() {
    var ids = {
      loading: "loading", progress: "progress", progressLabel: "progress-label",
      progressBar: "progress-bar", form: "question-form", container: "question-container",
      message: "message", actions: "actions", next: "next-button"
    };
    var ok = true;
    Object.keys(ids).forEach(function (key) {
      dom[key] = document.getElementById(ids[key]);
      if (!dom[key]) { ok = false; }
    });
    return ok;
  }

  function init() {
  var problems;

  // Éléments de l'écran d'introduction
  dom.intro = document.getElementById("intro");
  dom.startButton = document.getElementById("start-button");
  dom.surveyApp = document.getElementById("survey-app");

  if (!dom.intro || !dom.startButton || !dom.surveyApp) {
    fatal(null);
    return;
  }

  if (!collectDom()) {
    fatal(null);
    return;
  }

  if (!contract || !api) {
    fatal(["CR.contract ou CR.api est absent"]);
    return;
  }

  problems = checkDefinitions();

  if (problems.length > 0) {
    fatal(problems);
    return;
  }

  dom.back = el("button", "button button--secondary", TEXT.back);
  dom.back.type = "button";
  dom.back.hidden = true;
  dom.actions.insertBefore(dom.back, dom.next);

  prepareOrders();
  readSource();

  dom.form.addEventListener("submit", handleNext);
  dom.back.addEventListener("click", handleBack);

  // Le questionnaire reste caché tant que l'utilisateur
  // n'a pas appuyé sur « Commencer ».
  dom.surveyApp.hidden = true;

  dom.startButton.addEventListener("click", function () {
    dom.intro.hidden = true;
    dom.surveyApp.hidden = false;

    startSession();
  });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
