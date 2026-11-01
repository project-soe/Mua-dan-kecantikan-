const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-mua-putri';
export const config = {
  projectId,
  port: Number(process.env.PORT || 3000),
  storageBucket: process.env.STORAGE_BUCKET || `${projectId}.appspot.com`,
  recentAuthSeconds: Number(process.env.RECENT_AUTH_SECONDS || 900),
};
