import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const seasonalHandler = a.handler.custom({ dataSource: 'seasonalBackend', entry: '../seasonal/resolver.js' });
const directoryHandler = a.handler.custom({ dataSource: 'directoryBackend', entry: '../directory/resolver.js' });
const schema = a.schema({
  directoryList: a.query().returns(a.json())
    .authorization(allow => [allow.groups(['admin'])]).handler(directoryHandler),
  directoryCreateInvitee: a.mutation().arguments({ fields: a.json().required(), expectedRevision: a.integer().required() })
    .returns(a.json()).authorization(allow => [allow.groups(['admin'])]).handler(directoryHandler),
  directoryUpdate: a.mutation().arguments({ id: a.string().required(), fields: a.json().required(),
    expectedRevision: a.integer().required(), reviewed: a.boolean().required() })
    .returns(a.json()).authorization(allow => [allow.groups(['admin'])]).handler(directoryHandler),
  seasonState: a.query().arguments({ year: a.integer().required() }).returns(a.json())
    .authorization(allow => [allow.authenticated()]).handler(seasonalHandler),
  seasonSheet: a.query().arguments({ year: a.integer().required(), subject: a.string() }).returns(a.json())
    .authorization(allow => [allow.authenticated()]).handler(seasonalHandler),
  ensureSeasonSheet: a.mutation().arguments({ year: a.integer().required() }).returns(a.json())
    .authorization(allow => [allow.authenticated()]).handler(seasonalHandler),
  saveSeasonSheet: a.mutation().arguments({ year: a.integer().required(), answers: a.json().required(),
    expectedRevision: a.integer().required(), intent: a.string().required(), idempotencyKey: a.string().required() })
    .returns(a.json()).authorization(allow => [allow.authenticated()]).handler(seasonalHandler),
  seasonProgress: a.query().arguments({ year: a.integer().required(), nextToken: a.string() }).returns(a.json())
    .authorization(allow => [allow.groups(['admin'])]).handler(seasonalHandler),
  seasonAdmin: a.query().arguments({ year: a.integer().required() }).returns(a.json())
    .authorization(allow => [allow.groups(['admin'])]).handler(seasonalHandler),
  activateSeason: a.mutation().arguments({ year: a.integer().required(), expectedRevision: a.integer().required(),
    expectedActiveRevision: a.integer().required(), confirmed: a.boolean().required() }).returns(a.json())
    .authorization(allow => [allow.groups(['admin'])]).handler(seasonalHandler),
  configureSeason: a.mutation().arguments({ year: a.integer().required(), state: a.string().required(),
    expectedRevision: a.integer().required(), confirmed: a.boolean().required(), deadline: a.datetime() }).returns(a.json())
    .authorization(allow => [allow.groups(['admin'])]).handler(seasonalHandler),
  SantasSheet: a
    .model({
      year: a.integer(),
      displayName: a.string(),
      favoriteCandySnack: a.string().array(),
      favoriteScents: a.string().array(),
      favoriteFastFoodPlaces: a.string().array(),
      favoriteRestaurants: a.string().array(),
      favoriteStores: a.string().array(),
      cellPhoneModel: a.string(),
      favoriteSaying: a.string(),
      favoriteSportsTeam: a.string(),
      favoriteColorsTheme: a.string(),
      favoriteLogoEmblem: a.string(),
      anniversaryDate: a.string(),
      favoritePlaces: a.string().array(),
      clothingSizes: a.string(),
      otherFavorites: a.string(),
      familyDetails: a.string(),
      wishlistTopItems: a.string().array(),
      additionalNotes: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.groups(["admin"]),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});

/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: sheets } = await client.models.SantasSheet.list()

// return <ul>{sheets.map(sheet => <li key={sheet.id}>{sheet.content}</li>)}</ul>
