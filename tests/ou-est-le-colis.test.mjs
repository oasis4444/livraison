// « Où est mon colis ? » : lieu actuel + depuis quand, et qui a récupéré / qui livre (relais à deux livreurs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-shim.mjs';
import { handleApi } from '../src/worker.js';
import { whereNow, teamOf } from '../src/shipments.js';

const T = 1_780_000_000_000;
const base = { status: 'pending', created_at: T, relay: 0, courier_id: null, pickup_courier_id: null, delivery_courier_id: null };
const w = (o) => whereNow({ ...base, ...o }).code;

test('lieu du colis à chaque étape', () => {
  assert.equal(w({}), 'sender_waiting');
  assert.equal(w({ status: 'assigned', courier_id: 5 }), 'sender_planned');
  assert.equal(w({ status: 'assigned', courier_id: 5, stage: 'departed' }), 'pickup_coming');
  assert.equal(w({ status: 'picked_up', relay: 1, picked_at: T + 1 }), 'to_centre');
  const c = whereNow({ ...base, status: 'picked_up', relay: 1, picked_at: T + 1, centre_in_at: T + 2 });
  assert.equal(c.code, 'at_centre'); assert.equal(c.since, T + 2); assert.match(c.label, /Au centre Alefa/); assert.match(c.label_mg, /centre Alefa/);
  assert.equal(w({ status: 'picked_up', relay: 1, picked_at: T + 1, centre_in_at: T + 2, centre_out_at: T + 3 }), 'on_way');
  assert.equal(w({ status: 'picked_up', picked_at: T + 1, stage: 'nearby' }), 'nearby');
  assert.equal(w({ status: 'picked_up', picked_at: T + 1, courier_confirmed_at: T + 4 }), 'handed');
  assert.equal(w({ status: 'delivered', done_at: T + 5 }), 'delivered');
  assert.equal(w({ status: 'delivered', done_at: T + 5, province: 1 }), 'coop');
  assert.equal(w({ status: 'refused', picked_at: T + 1 }), 'returning');
  assert.equal(w({ status: 'refused', picked_at: T + 1, returned_at: T + 6 }), 'returned');
  assert.equal(w({ status: 'cancelled' }), 'cancelled');
});

test('qui a récupéré, qui livre', () => {
  // un seul livreur fait tout
  let t = teamOf({ ...base, status: 'picked_up', courier_id: 7, courier_name: 'Hery Velo', courier_vehicle: 'velo', picked_at: T });
  assert.equal(t.same, true); assert.equal(t.pickup.name, 'Hery Velo'); assert.equal(t.pickup.at, T);
  // relais : deux livreurs
  t = teamOf({ ...base, status: 'delivered', relay: 1, courier_id: 8, courier_name: 'Koto Moto', pickup_courier_id: 7, pickup_courier_name: 'Hery Velo', pickup_courier_vehicle: 'velo',
    delivery_courier_id: 8, delivery_courier_name: 'Koto Moto', delivery_courier_vehicle: 'moto', picked_at: T, centre_out_at: T + 2, done_at: T + 3 });
  assert.equal(t.same, false); assert.deepEqual([t.pickup.name, t.pickup.vehicle, t.delivery.name, t.delivery.vehicle, t.delivery.at], ['Hery Velo', 'velo', 'Koto Moto', 'moto', T + 3]);
  // relais dont le livreur de livraison n'est pas encore choisi
  t = teamOf({ ...base, status: 'picked_up', relay: 1, courier_id: 7, pickup_courier_id: 7, pickup_courier_name: 'Hery Velo', centre_in_at: T + 1 });
  assert.equal(t.delivery, null); assert.equal(t.pickup.name, 'Hery Velo');
});

test('page de suivi : lieu toujours visible, livreurs seulement après confirmation (prénoms)', async () => {
  const env = { DB: createD1(fileURLToPath(new URL('../migrations', import.meta.url))), PBKDF2_ITER: '1000' };
  const db = env.DB.raw;
  db.prepare("INSERT INTO users (id, phone, name, role, pass_hash, pass_salt, status, created_at) VALUES (1,'+261330000001','Boutique','client','x','s','active',0),(7,'+261341000007','Hery Velo','courier','x','s','active',0),(8,'+261341000008','Koto Moto','courier','x','s','active',0)").run();
  db.prepare("INSERT INTO couriers (user_id, vehicle) VALUES (7,'velo'),(8,'moto')").run();
  db.prepare(`INSERT INTO shipments (id, ref, sender_id, sender_name, sender_phone, pickup_addr, recipient_name, recipient_phone, drop_addr, fee, status, relay, courier_id, pickup_courier_id, delivery_courier_id, created_at, track_token, pin)
    VALUES (1,'ALW1',1,'Boutique','+261330000001','Analakely','Rivo','+261340000009','Ivandry',3000,'assigned',1,7,7,8,?, 'tokW1','1234')`).run(Date.now() - 3600e3);
  const get = async () => (await (await handleApi(new Request('https://alefa.test/api/track/tokW1'), env)).json());
  let r = await get();
  assert.equal(r.where.code, 'sender_planned'); assert.equal(r.team.hidden, true); assert.equal(r.team.pickup, null);
  db.prepare("UPDATE shipments SET status = 'picked_up', accepted_at = ?, picked_at = ?, centre_in_at = ? WHERE id = 1").run(Date.now() - 1800e3, Date.now() - 1500e3, Date.now() - 600e3);
  r = await get();
  assert.equal(r.where.code, 'at_centre');
  assert.deepEqual([r.team.pickup.name, r.team.pickup.vehicle, r.team.delivery.name, r.team.delivery.vehicle, r.team.same], ['Hery', 'velo', 'Koto', 'moto', false]);
});
