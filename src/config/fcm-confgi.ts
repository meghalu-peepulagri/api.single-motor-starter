import envData from "../env.js";

const fcmConfig = {
  fcm_primary_key: envData.FCM_PRIMERY_KEY!,
  fcm_type: envData.FCM_TYPE!,
  fcm_project_id: envData.FCM_PROJECT_ID!,
  fcm_private_key_id: envData.FCM_PRIVATE_KEY_ID!,
  fcm_client_email: envData.FCM_CLIENT_EMAIL!,
  fcm_client_id: envData.FCM_CLIENT_ID!,
  fcm_auth_uri: envData.FCM_AUTH_URI!,
  fcm_token_uri: envData.FCM_TOKEN_URI!,
  fcm_auth_provider_x509_cert_url: envData.FCM_AUTH_PROVIDER_X509_CERT_URL!,
  fcm_client_x509_cert_url: envData.FCM_CLIENT_X509_CERT_URL!,
  fcm_universe_domain: envData.FCM_UNIVERSE_DOMAIN!,
}

export default fcmConfig;
