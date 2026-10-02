(function () {
  "use strict";

  var config = window.CR && window.CR.config;

  var form = document.getElementById("login-form");
  var emailInput = document.getElementById("email");
  var passwordInput = document.getElementById("password");
  var loginButton = document.getElementById("login-button");
  var message = document.getElementById("login-message");

  if (!config || !config.supabaseUrl || !config.supabaseKey) {
    showMessage("Configuration Supabase introuvable.", true);
    return;
  }

  if (!form || !emailInput || !passwordInput || !loginButton || !message) {
    return;
  }

  function showMessage(text, isError) {
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle("is-error", !!isError);
    message.classList.toggle("is-success", !isError);
  }

  function clearMessage() {
    message.textContent = "";
    message.hidden = true;
    message.classList.remove("is-error", "is-success");
  }

  function setLoading(loading) {
    loginButton.disabled = loading;
    loginButton.textContent = loading
      ? "Connexion…"
      : "Se connecter →";
  }

  async function signIn(email, password) {
    var response;
    var data;

    response = await fetch(
      config.supabaseUrl + "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabaseKey
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      }
    );

    data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error_description ||
        data.msg ||
        data.message ||
        "Connexion impossible."
      );
    }

    if (!data.access_token) {
      throw new Error("Session Supabase introuvable.");
    }

    return data;
  }

  async function checkAdmin(accessToken) {
    var response;
    var data;

    response = await fetch(
      config.supabaseUrl + "/rest/v1/rpc/is_admin",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": config.supabaseKey,
          "Authorization": "Bearer " + accessToken
        },
        body: "{}"
      }
    );

    data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        "Impossible de vérifier les droits administrateur."
      );
    }

    return data === true;
  }

  form.addEventListener("submit", async function (event) {
    var email;
    var password;
    var session;
    var isAdmin;

    event.preventDefault();
    clearMessage();

    email = emailInput.value.trim();
    password = passwordInput.value;

    if (!email || !password) {
      showMessage(
        "Veuillez renseigner votre email et votre mot de passe.",
        true
      );
      return;
    }

    setLoading(true);

    try {
      session = await signIn(email, password);
      isAdmin = await checkAdmin(session.access_token);

      if (!isAdmin) {
        showMessage(
          "Ce compte n’a pas les droits administrateur.",
          true
        );
        setLoading(false);
        return;
      }

      sessionStorage.setItem(
        "cr_admin_access_token",
        session.access_token
      );

      if (session.refresh_token) {
        sessionStorage.setItem(
          "cr_admin_refresh_token",
          session.refresh_token
        );
      }

      showMessage(
        "Connexion réussie. Ouverture de l’administration…",
        false
      );

      setTimeout(function () {
        window.location.href = "./dashboard.html";
      }, 500);

    } catch (error) {
      console.error(error);

      showMessage(
        error.message || "Une erreur est survenue.",
        true
      );

      setLoading(false);
    }
  });
})();
