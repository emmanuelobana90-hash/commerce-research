// js/api.js
// Communication entre le navigateur et Supabase.
//
// Rôle : appeler, avec fetch(), les trois fonctions SQL (RPC) du questionnaire :
//   start_survey_session      -> CR.api.startSession(source)
//   update_session_progress   -> CR.api.updateProgress(sessionId, questionNumber)
//   submit_response           -> CR.api.submitResponse(payload, contact, sessionId)
//
// Ce fichier ne sait RIEN du questionnaire : il ne valide aucune réponse
// (c'est le rôle de contract.js), n'affiche rien, ne touche pas à la page,
// et ne garde aucun état (survey.js conserve l'identifiant de session).
//
// CONTRAT DE RETOUR
// Chaque fonction renvoie une promesse qui se résout TOUJOURS (jamais
// d'exception à attraper) avec :
//   succès : { ok: true,  data: ... }
//   échec  : { ok: false, error: { kind, status, code, message, retryable } }
//
// error.kind :
//   "unsupported"      le navigateur n'a pas fetch()
//   "config"           config.js absent ou incomplet
//   "bad_argument"     argument de mauvais type (erreur de programmation)
//   "network"          pas de connexion, serveur injoignable
//   "timeout"          le serveur n'a pas répondu à temps
//   "http"             le serveur a répondu par une erreur (status, code, message)
//   "invalid_response" le serveur a répondu un contenu inattendu
// error.retryable : true si réessayer plus tard a un sens (réseau, délai,
//   serveur surchargé). error.message est un texte technique : ne jamais
//   l'afficher tel quel au commerçant.

window.CR = window.CR || {};

window.CR.api = (function () {
  "use strict";

  // Délai maximal d'attente d'une réponse, en millisecondes.
  var TIMEOUT_MS = 15000;

  // Liste fermée des fonctions SQL appelables depuis ce fichier.
  var RPC = {
    start: "start_survey_session",
    progress: "update_session_progress",
    submit: "submit_response"
  };

  // ------------------------------------------------------------------
  // 1. FABRIQUES DE RÉSULTATS
  // ------------------------------------------------------------------
  function success(data) {
    return { ok: true, data: data };
  }

  function failure(kind, details) {
    var d = details || {};
    return {
      ok: false,
      error: {
        kind: kind,
        status: typeof d.status === "number" ? d.status : null,
        code: typeof d.code === "string" ? d.code : null,
        message: typeof d.message === "string" ? d.message : null,
        retryable: d.retryable === true
      }
    };
  }

  // Erreur renvoyée par le serveur (HTTP 4xx ou 5xx). Supabase répond en
  // général un JSON { code, message, details, hint } ; sinon on garde null.
  function httpFailure(status, body) {
    var isObject = body !== null && typeof body === "object";
    return failure("http", {
      status: status,
      code: isObject && typeof body.code === "string" ? body.code : null,
      message: isObject && typeof body.message === "string" ? body.message : null,
      retryable: status === 408 || status === 429 || status >= 500
    });
  }

  // ------------------------------------------------------------------
  // 2. PETITS CONTRÔLES DE FORME (pas de règles du questionnaire)
  // ------------------------------------------------------------------
  function isNonEmptyString(value) {
    return typeof value === "string" && value !== "";
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isAbsent(value) {
    return value === null || value === undefined;
  }

  // ------------------------------------------------------------------
  // 3. CONFIGURATION ET URL
  // ------------------------------------------------------------------
  function readConfig() {
    var cfg = window.CR && window.CR.config;
    if (!cfg ||
        !isNonEmptyString(cfg.supabaseUrl) ||
        !isNonEmptyString(cfg.supabaseKey) ||
        !isNonEmptyString(cfg.rpcPath)) {
      return null;
    }
    return cfg;
  }

  function buildUrl(cfg, functionName) {
    return cfg.supabaseUrl.replace(/\/+$/, "") + cfg.rpcPath + functionName;
  }

  // ------------------------------------------------------------------
  // 4. APPEL RPC GÉNÉRIQUE : le seul endroit qui utilise fetch()
  // ------------------------------------------------------------------
  function callRpc(functionName, body) {
    var cfg;
    var bodyText;
    var controller = null;
    var timer = null;
    var timedOut = false;
    var options;

    if (typeof fetch !== "function") {
      return Promise.resolve(failure("unsupported"));
    }

    cfg = readConfig();
    if (cfg === null) {
      return Promise.resolve(failure("config"));
    }

    try {
      bodyText = JSON.stringify(body);
    } catch (e) {
      return Promise.resolve(failure("bad_argument"));
    }

    options = {
      method: "POST",
      headers: {
        // La clé publique va dans "apikey". On n'envoie pas d'en-tête
        // Authorization : cette clé n'est pas un jeton de connexion.
        "apikey": cfg.supabaseKey,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: bodyText,
      credentials: "omit"
    };

    // Délai maximal : sans lui, une connexion qui "pend" bloquerait
    // l'envoi indéfiniment.
    if (typeof AbortController === "function") {
      controller = new AbortController();
      options.signal = controller.signal;
      timer = setTimeout(function () {
        timedOut = true;
        controller.abort();
      }, TIMEOUT_MS);
    }

    return Promise.resolve()
      .then(function () {
        return fetch(buildUrl(cfg, functionName), options);
      })
      .then(function (response) {
        return response.text().then(function (text) {
          var parsed = null;
          var parseFailed = false;

          if (text !== "") {
            try {
              parsed = JSON.parse(text);
            } catch (e) {
              parseFailed = true;
            }
          }

          if (response.ok) {
            // Une fonction "void" répond 204 (corps vide) : data vaut null.
            return parseFailed
              ? failure("invalid_response", { status: response.status })
              : success(parsed);
          }
          return httpFailure(response.status, parseFailed ? null : parsed);
        });
      })
      .catch(function () {
        // fetch() a échoué avant d'obtenir une réponse complète.
        return failure(timedOut ? "timeout" : "network", { retryable: true });
      })
      .then(function (result) {
        if (timer !== null) { clearTimeout(timer); }
        return result;
      });
  }

  // Les fonctions qui renvoient un identifiant doivent renvoyer un texte.
  function expectText(result) {
    if (result.ok && !isNonEmptyString(result.data)) {
      return failure("invalid_response");
    }
    return result;
  }

  // ------------------------------------------------------------------
  // 5. FONCTIONS PUBLIQUES (utilisées par survey.js)
  // ------------------------------------------------------------------

  // Démarre une session. source : valeur brute du paramètre "src" du lien,
  // envoyée telle quelle (null ou undefined si le lien n'en contient pas).
  // Succès : data = identifiant de la session (texte).
  function startSession(source) {
    var body = {};

    if (!isAbsent(source)) {
      if (typeof source !== "string") {
        return Promise.resolve(failure("bad_argument"));
      }
      body.p_source = source;
    }
    return callRpc(RPC.start, body).then(expectText);
  }

  // Signale la dernière question atteinte. Succès : data = null.
  function updateProgress(sessionId, questionNumber) {
    if (!isNonEmptyString(sessionId) || typeof questionNumber !== "number") {
      return Promise.resolve(failure("bad_argument"));
    }
    return callRpc(RPC.progress, {
      p_session_id: sessionId,
      p_question: questionNumber
    });
  }

  // Envoie la réponse complète. contact et sessionId sont facultatifs
  // (null ou undefined s'ils sont absents).
  // Succès : data = identifiant de la réponse (texte).
  // Renvoyer la même session renvoie la même réponse (pas de doublon).
  function submitResponse(payload, contact, sessionId) {
    var body;

    if (!isPlainObject(payload) ||
        (!isAbsent(contact) && !isPlainObject(contact)) ||
        (!isAbsent(sessionId) && !isNonEmptyString(sessionId))) {
      return Promise.resolve(failure("bad_argument"));
    }

    body = { p_payload: payload };
    if (!isAbsent(contact)) { body.p_contact = contact; }
    if (!isAbsent(sessionId)) { body.p_session_id = sessionId; }

    return callRpc(RPC.submit, body).then(expectText);
  }

  return Object.freeze({
    startSession: startSession,
    updateProgress: updateProgress,
    submitResponse: submitResponse
  });
})();
