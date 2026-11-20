import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ENGINEERS,
  SUBTAB_ALL,
  SUBTAB_DIRECT,
  actorEngineerId,
  assignOrders,
  buildMyOrdersSubtabs,
  claimOrders,
  followOrders,
  getOrderEngineerId,
  isOrderFollowedBy,
  isOrderInEngineerTray,
  manualEngineerId,
  matchesMyOrdersSubtab,
  normalizeOrderAssignments,
  parseAssignBody,
  parseOrderKeys,
  releaseOrders,
} from '../../shared/orderAssignments';

test('normalize siempre incluye los ingenieros por defecto y filtra lo inválido', () => {
  assert.deepEqual(normalizeOrderAssignments(null).engineers, DEFAULT_ENGINEERS);
  const out = normalizeOrderAssignments({
    engineers: [{ id: 'luis', name: 'Luis' }, { id: 'x', name: 'x' }, { id: 'rogelio', name: 'Otro' }, 7],
    assignments: { S01: 'luis', S02: 'fantasma', S03: 5 },
  });
  assert.deepEqual(out.engineers.map(e => e.id), ['luis']);
  assert.deepEqual(out.assignments, { S01: 'luis' });
});

test('Edgar, Antonio y Rogelio ya no aparecen en la lista; sus asignaciones antiguas se descartan', () => {
  assert.deepEqual(normalizeOrderAssignments(null).engineers, []);
  const out = normalizeOrderAssignments({ assignments: { S01: 'rogelio', S02: 'edgar-castro', S03: 'antonio-vazquez' } });
  assert.deepEqual(out.assignments, {});
});

test('los ingenieros sembrados por código se quitan de la lista guardada; las cuentas conectadas se quedan', () => {
  const out = normalizeOrderAssignments({
    engineers: [
      { id: 'edgar-castro', name: 'Edgar Castro' },
      { id: 'antonio-vazquez', name: 'Antonio Vázquez' },
      { id: 'rogelio', name: 'Rogelio' },
      { id: 'u-A1', name: 'Emiliano Vázquez' },
    ],
    assignments: { S01: 'u-A1', S02: 'rogelio' },
  });
  assert.deepEqual(out.engineers, [{ id: 'u-A1', name: 'Emiliano Vázquez' }]);
  assert.deepEqual(out.assignments, { S01: 'u-A1' });
});

test('claimOrders: cada quien se asigna a sí mismo y queda en la lista con su nombre', () => {
  const ana = { uid: 'A1', name: 'Ana Ruiz', email: 'ana@smv.com' };
  let state = normalizeOrderAssignments(null);
  state = claimOrders(state, ana, ['S01', 'S02']);
  assert.deepEqual(state.assignments, { S01: actorEngineerId('A1'), S02: actorEngineerId('A1') });
  assert.deepEqual(state.engineers.find(e => e.id === actorEngineerId('A1')), { id: 'u-A1', name: 'Ana Ruiz' });
  state = claimOrders(state, { ...ana, name: 'Ana R.' }, ['S03']);
  assert.equal(state.engineers.filter(e => e.id === 'u-A1').length, 1);
  assert.equal(state.engineers.find(e => e.id === 'u-A1')?.name, 'Ana R.');
});

test('claimOrders: puede tomar una orden que tenía otra persona', () => {
  let state = normalizeOrderAssignments({ engineers: [{ id: 'u-C3', name: 'Carla' }], assignments: { S01: 'u-C3' } });
  state = claimOrders(state, { uid: 'B2', name: null, email: 'beto@smv.com' }, ['S01']);
  assert.equal(state.assignments.S01, 'u-B2');
  assert.equal(state.engineers.find(e => e.id === 'u-B2')?.name, 'beto@smv.com');
});

test('releaseOrders: solo suelta lo propio', () => {
  const ana = { uid: 'A1', name: 'Ana', email: null };
  let state = normalizeOrderAssignments({ engineers: [{ id: 'u-C3', name: 'Carla' }], assignments: { S09: 'u-C3' } });
  state = claimOrders(state, ana, ['S01']);
  state = releaseOrders(state, 'A1', ['S01', 'S09']);
  assert.deepEqual(state.assignments, { S09: 'u-C3' });
});

test('claimOrders y parseOrderKeys validan la entrada', () => {
  const state = normalizeOrderAssignments(null);
  assert.throws(() => claimOrders(state, { uid: '', name: 'x', email: null }, ['S01']));
  assert.deepEqual(parseOrderKeys({ orderKeys: ['S01'] }), ['S01']);
  assert.throws(() => parseOrderKeys({ orderKeys: [] }));
  assert.throws(() => parseOrderKeys({ orderKeys: [1] }));
  assert.throws(() => parseOrderKeys(null));
});

test('getOrderEngineerId busca por nombre y luego por id', () => {
  assert.equal(getOrderEngineerId({ S01: 'rogelio', '7': 'edgar-castro' }, { id: 7, name: 'S01' }), 'rogelio');
  assert.equal(getOrderEngineerId({ '7': 'edgar-castro' }, { id: 7, name: 'S01' }), 'edgar-castro');
  assert.equal(getOrderEngineerId({}, { id: 7, name: 'S01' }), null);
});

test('nombre de 1 carácter sobrevive claimOrders -> normalizeOrderAssignments y parseOrderKeys rechaza vacíos/prototipo', () => {
  const claimed = claimOrders(normalizeOrderAssignments(null), { uid: 'X1', name: 'A', email: null }, ['S01']);
  const reloaded = normalizeOrderAssignments(JSON.parse(JSON.stringify(claimed)));
  assert.equal(reloaded.engineers.length, 1);
  assert.equal(reloaded.engineers[0].name, 'A.');
  assert.equal(reloaded.assignments.S01, 'u-X1');

  for (const bad of [[''], ['   '], ['__proto__'], ['constructor'], ['prototype']]) {
    assert.throws(() => parseOrderKeys({ orderKeys: bad }), /orderKeys inválido/);
  }
});

test('assignOrders permite a Lorena escribir un ingeniero sin cuenta y mantenerlo en su bandeja y subpestañas', () => {
  const lorena = { uid: 'L1', name: 'Lorena', email: 'lorena@smv.com' };
  let state = normalizeOrderAssignments(null);
  state = claimOrders(state, lorena, ['S01']);
  state = assignOrders(state, lorena, ['S02', 'S03'], { engineerName: 'Rogelio' });

  const rogelioId = manualEngineerId('Rogelio');
  assert.equal(rogelioId, 'm-rogelio');
  assert.equal(state.assignments.S01, 'u-L1');
  assert.equal(state.assignments.S02, 'm-rogelio');
  assert.equal(state.assignments.S03, 'm-rogelio');
  assert.deepEqual(state.followers['u-L1'], ['S02', 'S03']);

  // Persiste tras serializar y normalizar (m-rogelio no choca con el legacy "rogelio").
  const reloaded = normalizeOrderAssignments(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.assignments.S02, 'm-rogelio');
  assert.deepEqual(reloaded.followers['u-L1'], ['S02', 'S03']);

  const orders = [
    { id: 1, name: 'S01' },
    { id: 2, name: 'S02' },
    { id: 3, name: 'S03' },
  ];
  assert.equal(isOrderInEngineerTray(reloaded, 'u-L1', orders[0]), true);
  assert.equal(isOrderInEngineerTray(reloaded, 'u-L1', orders[1]), true);
  assert.equal(isOrderFollowedBy(reloaded.followers, 'u-L1', orders[1]), true);

  const subtabs = buildMyOrdersSubtabs(reloaded, 'u-L1', orders);
  assert.deepEqual(subtabs, [
    { id: SUBTAB_ALL, label: 'Todas', count: 3 },
    { id: SUBTAB_DIRECT, label: 'Mías directas', count: 1 },
    { id: 'm-rogelio', label: 'Rogelio', count: 2, isManual: true },
  ]);

  assert.deepEqual(
    orders.filter(o => matchesMyOrdersSubtab(reloaded, 'u-L1', SUBTAB_ALL, o)).map(o => o.name),
    ['S01', 'S02', 'S03'],
  );
  assert.deepEqual(
    orders.filter(o => matchesMyOrdersSubtab(reloaded, 'u-L1', SUBTAB_DIRECT, o)).map(o => o.name),
    ['S01'],
  );
  assert.deepEqual(
    orders.filter(o => matchesMyOrdersSubtab(reloaded, 'u-L1', 'm-rogelio', o)).map(o => o.name),
    ['S02', 'S03'],
  );
});

test('followOrders y assignOrders con ingeniero con cuenta conservan al ingeniero y lo agregan a la subpestaña de Lorena', () => {
  const carlos = { uid: 'C1', name: 'Carlos Núñez', email: 'carlos@smv.com' };
  const lorena = { uid: 'L1', name: 'Lorena', email: 'lorena@smv.com' };
  let state = normalizeOrderAssignments(null);

  // Carlos se asigna S10 con su cuenta.
  state = claimOrders(state, carlos, ['S10']);
  // Lorena decide seguir S10 para verla en sus subpestañas sin quitársela a Carlos.
  state = followOrders(state, lorena, ['S10']);
  // Y además Lorena escribe "carlos nunez" en S11: reutiliza la cuenta u-C1 existente.
  state = assignOrders(state, lorena, ['S11'], { engineerName: 'carlos nunez' });

  assert.equal(state.assignments.S10, 'u-C1');
  assert.equal(state.assignments.S11, 'u-C1');
  assert.deepEqual(state.followers['u-L1'], ['S10', 'S11']);

  const orders = [{ id: 10, name: 'S10' }, { id: 11, name: 'S11' }];
  // Tanto Carlos como Lorena ven S10 y S11 en sus respectivas bandejas "Mis órdenes".
  assert.equal(isOrderInEngineerTray(state, 'u-C1', orders[0]), true);
  assert.equal(isOrderInEngineerTray(state, 'u-L1', orders[0]), true);

  // Si Lorena suelta S10, deja de seguirla pero Carlos NO pierde su orden.
  state = releaseOrders(state, 'L1', ['S10']);
  assert.equal(state.assignments.S10, 'u-C1');
  assert.equal(isOrderInEngineerTray(state, 'u-L1', orders[0]), false);
  assert.equal(isOrderInEngineerTray(state, 'u-C1', orders[0]), true);
});

test('releaseOrders limpia la asignación cuando el ingeniero era manual (sin cuenta)', () => {
  const lorena = { uid: 'L1', name: 'Lorena', email: 'lorena@smv.com' };
  let state = normalizeOrderAssignments(null);
  state = assignOrders(state, lorena, ['S20'], { engineerName: 'Marco' });
  assert.equal(state.assignments.S20, 'm-marco');

  state = releaseOrders(state, 'L1', ['S20']);
  assert.equal(state.assignments.S20, undefined);
  assert.equal(state.followers['u-L1'], undefined);
});

test('parseAssignBody valida claves y nombre o id del ingeniero', () => {
  assert.deepEqual(
    parseAssignBody({ orderKeys: ['S01'], engineerName: '  Ing. Marco  ' }),
    { orderKeys: ['S01'], target: { engineerName: 'Ing. Marco' } },
  );
  assert.deepEqual(
    parseAssignBody({ orderKeys: ['S01'], engineerId: 'u-C1' }),
    { orderKeys: ['S01'], target: { engineerId: 'u-C1' } },
  );
  assert.throws(() => parseAssignBody({ orderKeys: ['S01'] }), /Indica el ingeniero/);
  assert.throws(() => parseAssignBody({ orderKeys: ['S01'], engineerName: 'A' }), /entre 2 y 50/);
  assert.throws(() => parseAssignBody({ orderKeys: ['S01'], engineerId: '__proto__' }), /Ingeniero inválido/);
});
