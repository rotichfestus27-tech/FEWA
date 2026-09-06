const assert = require('assert');
const { claimIncludesRole, normalizeRoles } = require('../server/create-superadmin.js');

assert.strictEqual(claimIncludesRole({ roles: { superadmin: true } }, 'superadmin'), true);
assert.strictEqual(claimIncludesRole({ roles: ['superadmin', 'admissions'] }, 'superadmin'), true);
assert.strictEqual(claimIncludesRole({ roles: { admissions: true } }, 'superadmin'), false);
assert.deepStrictEqual(normalizeRoles({ roles: { admin: true, superadmin: true } }), ['admin', 'superadmin']);

console.log('superadmin bootstrap helpers: PASS');
