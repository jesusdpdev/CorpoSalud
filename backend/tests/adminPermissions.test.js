const assert = require('node:assert/strict');
const test = require('node:test');
const { authorizeCategory, requireAdmin } = require('../middleware/auth');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('solo el rol administrador puede entrar a la gestión de usuarios', () => {
  const response = createResponse();
  let continued = false;

  requireAdmin({ user: { rol_id: 2 } }, response, () => {
    continued = true;
  });

  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);
});

test('solo el rol administrador puede continuar con acciones administrativas', () => {
  const adminResponse = createResponse();
  let adminContinued = false;
  requireAdmin({ user: { rol_id: 3 } }, adminResponse, () => {
    adminContinued = true;
  });

  const asirResponse = createResponse();
  let asirContinued = false;
  requireAdmin({ user: { rol_id: 1 } }, asirResponse, () => {
    asirContinued = true;
  });

  assert.equal(adminContinued, true);
  assert.equal(asirResponse.statusCode, 403);
  assert.equal(asirContinued, false);
});

test('el administrador puede gestionar ambas clasificaciones', () => {
  for (const categoria of ['asir', 'asic']) {
    const response = createResponse();
    let continued = false;

    authorizeCategory(
      { params: { categoria }, user: { rol_id: 3 } },
      response,
      () => {
        continued = true;
      }
    );

    assert.equal(response.statusCode, 200);
    assert.equal(continued, true);
  }
});

test('ASIR y ASIC no pueden acceder a la clasificación del otro perfil', () => {
  for (const [role, categoria] of [[1, 'asic'], [2, 'asir']]) {
    const response = createResponse();
    authorizeCategory({ params: { categoria }, user: { rol_id: role } }, response, () => {});
    assert.equal(response.statusCode, 403);
  }
});
