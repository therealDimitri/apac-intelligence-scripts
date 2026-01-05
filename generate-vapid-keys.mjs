#!/usr/bin/env node

/**
 * Generate VAPID Keys for Push Notifications
 *
 * Usage: node scripts/generate-vapid-keys.mjs
 *
 * This script generates VAPID keys required for Web Push notifications.
 * Add the generated keys to your .env.local file.
 */

import webpush from 'web-push';

console.log('Generating VAPID keys for push notifications...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('✅ VAPID keys generated successfully!\n');
console.log('Add these to your .env.local file:\n');
console.log('─'.repeat(80));
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:support@apac-intelligence.com`);
console.log('─'.repeat(80));
console.log('\n⚠️  Important:');
console.log('  • Keep the private key secret');
console.log('  • Do not commit these keys to version control');
console.log('  • The public key can be safely exposed in client-side code');
console.log('  • Update VAPID_SUBJECT to your support email or website URL\n');
