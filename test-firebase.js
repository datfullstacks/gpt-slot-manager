import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log('Testing Firebase Connection...\n');

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL
};

console.log('Firebase Config:');
console.log('- Project ID:', serviceAccount.project_id);
console.log('- Client Email:', serviceAccount.client_email);
console.log('- Private Key Length:', serviceAccount.private_key.length);

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });
  console.log('\n✅ Firebase Admin SDK initialized');

  const db = admin.firestore();
  
  // Configure Firestore settings
  db.settings({
    ignoreUndefinedProperties: true,
  });
  
  console.log('✅ Firestore instance created');
  console.log('   Project:', db.projectId);

  // Try to write a test document
  console.log('\nAttempting to write test document...');
  const testRef = db.collection('test').doc('connection-test');
  await testRef.set({
    message: 'Firebase connection test',
    timestamp: new Date().toISOString()
  });
  console.log('✅ Test document written successfully');

  // Try to read the test document
  console.log('\nAttempting to read test document...');
  const doc = await testRef.get();
  if (doc.exists) {
    console.log('✅ Test document read successfully:', doc.data());
  } else {
    console.log('❌ Test document not found');
  }

  // Clean up
  await testRef.delete();
  console.log('✅ Test document deleted');

  console.log('\n🎉 Firebase connection test PASSED!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Firebase connection test FAILED!');
  console.error('Error:', error.message);
  console.error('Full error:', error);
  process.exit(1);
}
