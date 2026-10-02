// js/config.js
// Configuration Supabase du questionnaire public.
// Ce fichier ne contient ni logique ni secret : uniquement des valeurs
// publiques. Les autres fichiers (contract.js, api.js, survey.js)
// liront ces valeurs via window.CR.config.

window.CR = window.CR || {};

window.CR.config = Object.freeze({
  supabaseUrl: "https://cdehzismucqzpoouiefy.supabase.co",
  supabaseKey: "sb_publishable__NugWXEBMOGftJTM2l2E1Q_VEYhiYMi",
  rpcPath: "/rest/v1/rpc/"
});
