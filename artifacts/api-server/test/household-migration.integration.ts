import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, pool } from "@workspace/db";

const suffix = crypto.randomUUID().replaceAll("-", "");
const schemaName = `migration_test_${suffix}`;
const client = await pool.connect();
const migrationDir = path.resolve(process.cwd(), "../../lib/db/migrations");

try {
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);
  await client.query(`
    CREATE TABLE households (
      id serial PRIMARY KEY,
      name text NOT NULL
    );
    CREATE TABLE properties (
      id serial PRIMARY KEY,
      household_id integer,
      name text NOT NULL
    );
    CREATE TABLE user_profiles (
      id serial PRIMARY KEY,
      household_id integer,
      linked_family_member_id integer
    );
    CREATE TABLE family_members (
      id serial PRIMARY KEY,
      name text NOT NULL,
      role text NOT NULL,
      color text NOT NULL,
      avatar_initials text NOT NULL,
      photo_url text,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE ai_memories (
      id serial PRIMARY KEY,
      content text NOT NULL,
      category text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE chores (
      id serial PRIMARY KEY,
      assignee_id integer,
      property_id integer
    );
    CREATE TABLE meal_plans (
      id serial PRIMARY KEY,
      property_id integer
    );
    CREATE TABLE meal_ratings (
      id serial PRIMARY KEY,
      member_id integer,
      meal_plan_id integer
    );
    CREATE TABLE todo_lists (
      id serial PRIMARY KEY,
      name text NOT NULL,
      assignee_id integer,
      property_id integer,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
    CREATE TABLE push_tokens (
      id serial PRIMARY KEY,
      token text NOT NULL
    );
  `);

  const households = await client.query(
    `INSERT INTO households (name) VALUES ($1), ($2) RETURNING id, name`,
    [`Legacy household A ${suffix}`, `Legacy household B ${suffix}`],
  );
  const [householdA, householdB] = households.rows;
  const properties = await client.query(
    `INSERT INTO properties (household_id, name) VALUES ($1, $2), ($3, $4) RETURNING id`,
    [householdA.id, `Legacy property A ${suffix}`, householdB.id, `Legacy property B ${suffix}`],
  );
  const [propertyA, propertyB] = properties.rows;
  const members = await client.query(
    `INSERT INTO family_members (name, role, color, avatar_initials)
     VALUES ($1, 'parent', '#111111', 'A'), ($2, 'parent', '#222222', 'B'), ($3, 'child', '#333333', 'O')
     RETURNING id, name`,
    [`Legacy member A ${suffix}`, `Legacy member B ${suffix}`, `Legacy orphan ${suffix}`],
  );
  const [memberA, memberB] = members.rows;

  await client.query(
    `INSERT INTO user_profiles (household_id, linked_family_member_id) VALUES ($1, $2), ($3, $4)`,
    [householdA.id, memberA.id, householdB.id, memberB.id],
  );
  await client.query(
    `INSERT INTO ai_memories (content, category) VALUES ($1, 'general'), ($2, 'general')`,
    [`Legacy memory A ${suffix}`, `Legacy memory B ${suffix}`],
  );
  await client.query(
    `INSERT INTO todo_lists (name, property_id) VALUES ($1, $2), ($3, $4)`,
    [`Legacy list A ${suffix}`, propertyA.id, `Legacy list B ${suffix}`, propertyB.id],
  );
  await client.query(
    `INSERT INTO todo_lists (name, assignee_id, property_id) VALUES ($1, $2, $3)`,
    [`Legacy conflicting list ${suffix}`, memberB.id, propertyA.id],
  );

  for (const file of ["0005_scope_household_context.sql", "0006_scope_remaining_household_data.sql"]) {
    await client.query(await readFile(path.join(migrationDir, file), "utf8"));
  }

  const assignedMembers = await client.query(`
    SELECT fm.name, h.name AS household_name
    FROM family_members fm
    INNER JOIN households h ON h.id = fm.household_id
    ORDER BY fm.name
  `);
  assert.deepEqual(
    assignedMembers.rows,
    [
      { name: `Legacy member A ${suffix}`, household_name: `Legacy household A ${suffix}` },
      { name: `Legacy member B ${suffix}`, household_name: `Legacy household B ${suffix}` },
    ],
    "linked family members must retain their original household ownership",
  );

  const assignedLists = await client.query(`
    SELECT tl.name, h.name AS household_name
    FROM todo_lists tl
    INNER JOIN households h ON h.id = tl.household_id
    ORDER BY tl.name
  `);
  assert.deepEqual(
    assignedLists.rows,
    [
      { name: `Legacy list A ${suffix}`, household_name: `Legacy household A ${suffix}` },
      { name: `Legacy list B ${suffix}`, household_name: `Legacy household B ${suffix}` },
    ],
    "property-linked lists must retain their original household ownership",
  );

  const quarantinedMembers = await client.query(`SELECT name FROM unassigned_family_members`);
  assert.deepEqual(quarantinedMembers.rows, [{ name: `Legacy orphan ${suffix}` }]);
  const quarantinedLists = await client.query(`SELECT name FROM unassigned_todo_lists`);
  assert.deepEqual(quarantinedLists.rows, [{ name: `Legacy conflicting list ${suffix}` }]);

  const liveMemories = await client.query(`SELECT content FROM ai_memories`);
  assert.deepEqual(liveMemories.rows, [], "unattributable legacy AI memories must not become visible to any household");
  const quarantinedMemories = await client.query(`SELECT content FROM unassigned_ai_memories ORDER BY content`);
  assert.deepEqual(
    quarantinedMemories.rows,
    [
      { content: `Legacy memory A ${suffix}` },
      { content: `Legacy memory B ${suffix}` },
    ],
  );

  console.log("Household migration isolation integration test passed");
} finally {
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  } finally {
    client.release();
    await pool.end();
  }
}