export const config = {
  projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-mua-putri',
  port: Number(process.env.PORT || 3000),
};
