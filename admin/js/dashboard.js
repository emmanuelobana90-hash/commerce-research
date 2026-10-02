(function () {
  "use strict";

  var config = window.CR && window.CR.config;
  var accessToken = sessionStorage.getItem("cr_admin_access_token");
  var main = document.querySelector(".dashboard-main");
  var emailNode = document.querySelector(".admin-email");
  var logoutButton = document.getElementById("logout-button");

  var LABELS = {
    activity_type: {
      retail: "Commerce de détail",
      wholesale: "Commerce de gros",
      retail_wholesale: "Détail + gros",
      distribution: "Distribution",
      craft: "Artisanat",
      production: "Production",
      food: "Alimentation",
      services: "Services",
      construction: "Construction",
      other: "Autre"
    },

    role: {
      owner: "Propriétaire",
      manager: "Gérant",
      sales: "Vendeur",
      cashier: "Caissier / caissière",
      stock_manager: "Responsable stock",
      general_employee: "Employé polyvalent",
      other: "Autre"
    },

    team_size: {
      "1": "1 personne",
      "2_5": "2 à 5 personnes",
      "6_10": "6 à 10 personnes",
      "11_20": "11 à 20 personnes",
      "20_plus": "Plus de 20 personnes",
      prefer_not_to_say: "Préfère ne pas répondre"
    },

    current_tools: {
      paper: "Cahiers / papier",
      whatsapp: "WhatsApp",
      spreadsheet: "Tableur",
      management_software: "Logiciel de gestion",
      mobile_app: "Application mobile",
      cash_register: "Caisse",
      printed_documents: "Documents imprimés",
      none: "Aucun outil",
      other: "Autre"
    },

    difficulty_areas: {
      stock: "Gestion du stock",
      sales_orders: "Ventes / commandes",
      payments_cash: "Paiements / caisse",
      delivery: "Livraisons",
      suppliers: "Fournisseurs",
      employees_coordination: "Coordination des employés",
      information_retrieval: "Recherche d'informations",
      errors_omissions: "Erreurs / oublis",
      activity_visibility: "Visibilité sur l'activité",
      time_management: "Gestion du temps",
      other: "Autre",
      none: "Aucune difficulté particulière"
    },

    incident_types: {
      product_missing: "Produit manquant",
      order_sale: "Erreur de commande / vente",
      payment_cash: "Problème de paiement / caisse",
      delivery: "Problème de livraison",
      supplier: "Problème fournisseur",
      coordination: "Problème de coordination",
      information: "Information introuvable",
      error_omission: "Erreur / oubli",
      time_loss: "Perte de temps",
      money_loss: "Perte d'argent",
      other: "Autre",
      prefer_not_to_say: "Préfère ne pas répondre"
    },

    resolution_methods: {
      manual_correction: "Correction manuelle",
      phone_call: "Appel téléphonique",
      whatsapp: "WhatsApp",
      paper_check: "Vérification papier",
      spreadsheet: "Tableur",
      software: "Logiciel",
      redo_operation: "Refaire l'opération",
      wait: "Attendre",
      not_resolved: "Non résolu",
      other: "Autre"
    },

    recurrence: {
      yes_probably: "Oui, probablement",
      yes_rarely: "Oui, rarement",
      no_resolved: "Non, problème résolu",
      unknown: "Inconnu"
    },

    solution_interest: {
      yes: "Oui",
      maybe: "Peut-être",
      not_really: "Pas vraiment",
      unknown: "Inconnu"
    },

    source: {
      whatsapp: "WhatsApp",
      facebook: "Facebook",
      linkedin: "LinkedIn",
      field: "Terrain",
      professional_group: "Groupe professionnel",
      direct_link: "Lien direct",
      other: "Autre"
    }
  };

  function label(field, value) {
    if (LABELS[field] && LABELS[field][value]) {
      return LABELS[field][value];
    }

    if (value === null || value === undefined || value === "") {
      return "Non renseigné";
    }

    return String(value);
  }

  function escapeText(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  }

  function pick(row, keys) {
    var i;

    for (i = 0; i < keys.length; i++) {
      if (
        Object.prototype.hasOwnProperty.call(row, keys[i]) &&
        row[keys[i]] !== null &&
        row[keys[i]] !== undefined
      ) {
        return row[keys[i]];
      }
    }

    return null;
  }

  function arrayValue(value) {
    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === "string") {
      try {
        var parsed = JSON.parse(value);

        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (e) {
        return [value];
      }
    }

    return [];
  }

  function countValues(rows, field) {
    var counts = {};
    var total = 0;

    rows.forEach(function (row) {
      var values = arrayValue(row[field]);

      if (values.length === 0 && row[field] !== undefined && row[field] !== null) {
        values = [row[field]];
      }

      values.forEach(function (value) {
        var key = String(value);

        counts[key] = (counts[key] || 0) + 1;
        total++;
      });
    });

    return {
      counts: counts,
      total: total
    };
  }

  function sortedCounts(counts) {
    return Object.keys(counts)
      .map(function (key) {
        return {
          key: key,
          value: counts[key]
        };
      })
      .sort(function (a, b) {
        return b.value - a.value;
      });
  }

  function findOtherDetail(field, key, rows) {
    if (key !== "other") {
      return "";
    }

    var otherField = field + "_other";
    var details = [];

    rows.forEach(function (row) {
      if (row[otherField] !== null && row[otherField] !== undefined) {
        var detail = String(row[otherField]).trim();

        if (detail && details.indexOf(detail) === -1) {
          details.push(detail);
        }
      }
    });

    return details.join(" • ");
  }

  function distribution(field, rows) {
    var result = countValues(rows, field);
    var items = sortedCounts(result.counts);
    var total = result.total || 1;
    var html = "";

    if (items.length === 0) {
      return '<p class="empty-state">Aucune donnée disponible.</p>';
    }

    items.slice(0, 12).forEach(function (item) {
      var percent = Math.round((item.value / total) * 100);
      var detail = findOtherDetail(field, item.key, rows);

      html +=
        '<div class="distribution-item">' +
          '<div class="distribution-item__top">' +
            '<span class="distribution-item__label">' +
              escapeText(label(field, item.key)) +
            '</span>' +
            '<span class="distribution-item__value">' +
              item.value + " (" + percent + "%)" +
            '</span>' +
          "</div>" +
          (detail
            ? '<div class="distribution-item__detail">↳ Précision : ' +
                escapeText(detail) +
              '</div>'
            : "") +
          '<div class="distribution-item__track">' +
            '<div class="distribution-item__bar" style="width:' +
              Math.max(percent, 2) +
              '%"></div>' +
          "</div>" +
        "</div>";
    });

    return html;
  }

  function showLoading() {
    if (!main) {
      return;
    }

    main.innerHTML =
      '<div class="state-card">' +
        "<p>Chargement des données…</p>" +
      "</div>";
  }

  function showError(message) {
    if (!main) {
      return;
    }

    main.innerHTML =
      '<div class="state-card state-card--error">' +
        "<h2>Impossible de charger le dashboard</h2>" +
        "<p>" + escapeText(message) + "</p>" +
        '<button class="button button--primary" id="retry-button" type="button">' +
          "Réessayer" +
        "</button>" +
      "</div>";

    document
      .getElementById("retry-button")
      .addEventListener("click", loadDashboard);
  }

  async function supabase(path, options) {
    var response;
    var data;

    options = options || {};
    options.headers = Object.assign(
      {
        "apikey": config.supabaseKey,
        "Authorization": "Bearer " + accessToken,
        "Accept": "application/json"
      },
      options.headers || {}
    );

    response = await fetch(
      config.supabaseUrl + path,
      options
    );

    data = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      throw new Error(
        (data && (data.message || data.error || data.hint)) ||
        "Erreur Supabase (" + response.status + ")."
      );
    }

    return data;
  }

  async function verifyAdmin() {
    var result = await supabase("/rest/v1/rpc/is_admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });

    if (result !== true) {
      throw new Error("Cette session n'a pas les droits administrateur.");
    }
  }

  async function fetchRows(table) {
    return supabase(
      "/rest/v1/" +
      table +
      "?select=*&limit=1000",
      {
        method: "GET"
      }
    );
  }

  function formatDate(value) {
    if (!value) {
      return "Date inconnue";
    }

    var date = new Date(value);

    if (isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function getCompletedResponseSessionIds(responses) {
    var ids = {};

    responses.forEach(function (row) {
      var id = pick(row, [
        "session_id",
        "survey_session_id"
      ]);

      if (id) {
        ids[String(id)] = true;
      }
    });

    return ids;
  }

  function renderStats(responses, sessions) {
    var completed = responses.length;
    var totalSessions = sessions.length;
    var abandoned = Math.max(totalSessions - completed, 0);
    var completion =
      totalSessions > 0
        ? Math.round((completed / totalSessions) * 100)
        : 0;

    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          '<div>' +
            '<p class="section-kicker">VUE D’ENSEMBLE</p>' +
            "<h2>Les chiffres de l'étude</h2>" +
          "</div>" +
          '<span class="section-meta">' +
            completed + " réponse(s) complète(s)" +
          "</span>" +
        "</div>" +

        '<div class="stats-grid">' +
          '<article class="stat-card">' +
            '<span class="stat-card__label">Réponses</span>' +
            '<strong class="stat-card__value">' + completed + "</strong>" +
            '<span class="stat-card__detail">Questionnaires envoyés</span>' +
          "</article>" +

          '<article class="stat-card">' +
            '<span class="stat-card__label">Sessions</span>' +
            '<strong class="stat-card__value">' + totalSessions + "</strong>" +
            '<span class="stat-card__detail">Parcours commencés</span>' +
          "</article>" +

          '<article class="stat-card">' +
            '<span class="stat-card__label">Abandons</span>' +
            '<strong class="stat-card__value">' + abandoned + "</strong>" +
            '<span class="stat-card__detail">Sessions sans réponse finale</span>' +
          "</article>" +

          '<article class="stat-card">' +
            '<span class="stat-card__label">Taux de complétion</span>' +
            '<strong class="stat-card__value">' + completion + "%</strong>" +
            '<span class="stat-card__detail">Sessions → réponses</span>' +
          "</article>" +
        "</div>" +
      "</section>"
    );
  }

  function renderProfile(responses) {
    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          "<div>" +
            '<p class="section-kicker">PROFIL</p>' +
            "<h2>Qui répond à l'étude ?</h2>" +
          "</div>" +
        "</div>" +

        '<div class="analysis-grid">' +
          '<article class="panel">' +
            "<h3>Activité</h3>" +
            '<div class="distribution-list">' +
              distribution("activity_type", responses) +
            "</div>" +
          "</article>" +

          '<article class="panel">' +
            "<h3>Rôle</h3>" +
            '<div class="distribution-list">' +
              distribution("role", responses) +
            "</div>" +
          "</article>" +

          '<article class="panel">' +
            "<h3>Taille de l'équipe</h3>" +
            '<div class="distribution-list">' +
              distribution("team_size", responses) +
            "</div>" +
          "</article>" +

          '<article class="panel">' +
            "<h3>Ville</h3>" +
            '<div class="distribution-list">' +
              distribution("city", responses) +
            "</div>" +
          "</article>" +
        "</div>" +
      "</section>"
    );
  }

  function renderProblems(responses) {
    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          "<div>" +
            '<p class="section-kicker">PROBLÈMES</p>' +
            "<h2>Ce qui bloque les commerçants</h2>" +
          "</div>" +
        "</div>" +

        '<div class="analysis-grid">' +
          '<article class="panel">' +
            "<h3>Difficultés rencontrées</h3>" +
            '<div class="distribution-list">' +
              distribution("difficulty_areas", responses) +
            "</div>" +
          "</article>" +

          '<article class="panel">' +
            "<h3>Incidents récents</h3>" +
            '<div class="distribution-list">' +
              distribution("recent_incident", responses) +
            "</div>" +
          "</article>" +

          '<article class="panel">' +
            "<h3>Types d'incidents</h3>" +
            '<div class="distribution-list">' +
              distribution("incident_types", responses) +
            "</div>" +
          "</article>" +

          '<article class="panel">' +
            "<h3>Récurrence</h3>" +
            '<div class="distribution-list">' +
              distribution("recurrence", responses) +
            "</div>" +
          "</article>" +
        "</div>" +
      "</section>"
    );
  }

  function renderResolution(responses) {
    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          "<div>" +
            '<p class="section-kicker">RÉSOLUTION</p>' +
            "<h2>Comment les problèmes sont gérés</h2>" +
          "</div>" +
        "</div>" +

        '<div class="analysis-grid">' +
          '<article class="panel">' +
            "<h3>Méthodes utilisées</h3>" +
            '<div class="distribution-list">' +
              distribution("resolution_methods", responses) +
            "</div>" +
          "</article>" +

          '<article class="panel">' +
            "<h3>Intérêt pour une solution</h3>" +
            '<div class="distribution-list">' +
              distribution("solution_interest", responses) +
            "</div>" +
          "</article>" +
        "</div>" +
      "</section>"
    );
  }

  function renderTools(responses) {
    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          "<div>" +
            '<p class="section-kicker">OUTILS</p>' +
            "<h2>Comment les commerces travaillent aujourd'hui</h2>" +
          "</div>" +
        "</div>" +

        '<article class="panel panel--wide">' +
          '<div class="distribution-list">' +
            distribution("current_tools", responses) +
          "</div>" +
        "</article>" +
      "</section>"
    );
  }

  function renderSources(sessions) {
    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          "<div>" +
            '<p class="section-kicker">ACQUISITION</p>' +
            "<h2>D'où viennent les réponses ?</h2>" +
          "</div>" +
        "</div>" +

        '<article class="panel panel--wide">' +
          '<div class="distribution-list">' +
            distribution("source", sessions) +
          "</div>" +
        "</article>" +
      "</section>"
    );
  }

  function renderRecent(responses) {
    var sorted = responses.slice().sort(function (a, b) {
      var da = pick(a, ["created_at", "submitted_at", "completed_at"]);
      var db = pick(b, ["created_at", "submitted_at", "completed_at"]);

      return new Date(db || 0) - new Date(da || 0);
    });

    var html = "";

    sorted.slice(0, 10).forEach(function (row, index) {
      var city = pick(row, ["city"]);
      var activity = pick(row, ["activity_type"]);
      var created = pick(row, [
        "created_at",
        "submitted_at",
        "completed_at"
      ]);

      html +=
        '<article class="response-item">' +
          '<div class="response-item__top">' +
            '<div>' +
              '<p class="response-item__title">' +
                "Réponse #" + (index + 1) +
              "</p>" +
              '<p class="response-item__meta">' +
                escapeText(label("activity_type", activity)) +
                " · " +
                escapeText(city || "Ville inconnue") +
              "</p>" +
            "</div>" +
            '<span class="section-meta">' +
              escapeText(formatDate(created)) +
            "</span>" +
          "</div>" +
        "</article>";
    });

    if (!html) {
      html = '<p class="empty-state">Aucune réponse pour le moment.</p>';
    }

    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          "<div>" +
            '<p class="section-kicker">RÉCENT</p>' +
            "<h2>Dernières réponses</h2>" +
          "</div>" +
        "</div>" +

        '<article class="panel panel--wide">' +
          '<div class="responses-list">' +
            html +
          "</div>" +
        "</article>" +
      "</section>"
    );
  }

  function renderContacts(contacts) {
    var html = "";

    contacts
      .filter(function (row) {
        var consent = pick(row, ["consent"]);

        return consent === true || consent === "true";
      })
      .slice(0, 20)
      .forEach(function (row) {
        var method = pick(row, [
          "contact_method",
          "method"
        ]);

        var value = pick(row, [
          "contact_value",
          "value"
        ]);

        html +=
          '<article class="contact-item">' +
            '<div class="contact-item__top">' +
              '<p class="contact-item__title">' +
                escapeText(method || "Contact") +
              "</p>" +
            "</div>" +
            '<p class="contact-item__value">' +
              escapeText(value || "Valeur absente") +
            "</p>" +
          "</article>";
      });

    if (!html) {
      html = '<p class="empty-state">Aucun contact volontaire disponible.</p>';
    }

    return (
      '<section class="dashboard-section">' +
        '<div class="section-heading">' +
          "<div>" +
            '<p class="section-kicker">CONTACTS</p>' +
            "<h2>Personnes ayant accepté d'être recontactées</h2>" +
          "</div>" +
        "</div>" +

        '<article class="panel panel--wide">' +
          '<div class="contacts-list">' +
            html +
          "</div>" +
        "</article>" +
      "</section>"
    );
  }

  function render(responses, sessions, contacts) {
    if (!main) {
      throw new Error("Conteneur du dashboard introuvable.");
    }

    main.innerHTML =
      renderStats(responses, sessions) +
      renderProfile(responses) +
      renderProblems(responses) +
      renderResolution(responses) +
      renderTools(responses) +
      renderSources(sessions) +
      renderRecent(responses) +
      renderContacts(contacts);
  }

  function logout() {
    sessionStorage.removeItem("cr_admin_access_token");
    sessionStorage.removeItem("cr_admin_refresh_token");
    window.location.href = "./";
  }

  async function loadDashboard() {
    showLoading();

    if (!config || !config.supabaseUrl || !config.supabaseKey) {
      showError("Configuration Supabase introuvable.");
      return;
    }

    if (!accessToken) {
      window.location.href = "./";
      return;
    }

    try {
      await verifyAdmin();

      var results = await Promise.all([
        fetchRows("responses"),
        fetchRows("survey_sessions"),
        fetchRows("contacts")
      ]);

      render(
        results[0] || [],
        results[1] || [],
        results[2] || []
      );
    } catch (error) {
      console.error(error);

      if (
        error.message &&
        (
          error.message.indexOf("droits administrateur") !== -1 ||
          error.message.indexOf("JWT") !== -1 ||
          error.message.indexOf("token") !== -1 ||
          error.message.indexOf("session") !== -1
        )
      ) {
        logout();
        return;
      }

      showError(
        error.message || "Une erreur est survenue."
      );
    }
  }

  if (!main) {
    return;
  }

  if (emailNode) {
    emailNode.textContent =
      sessionStorage.getItem("cr_admin_email") ||
      "Administrateur";
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", logout);
  }

  loadDashboard();
})();
