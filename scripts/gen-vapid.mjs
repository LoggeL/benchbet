#!/usr/bin/env node
// Erzeugt ein VAPID-Schlüsselpaar für .env (optional – ohne Env-Werte erzeugt der Server data/vapid.json selbst).
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
