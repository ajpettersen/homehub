import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "homehub";
export default defineRailway(() => {
  const homehub = service("homehub", {
    source: github("ajpettersen/homehub", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "NIXPACKS" },
    start: "node artifacts/api-server/dist/index.mjs",
    replicas: { "sfo": 1 },
  });

  return project("wholesome-enjoyment", {
    variables: { managed: false },
    resources: [homehub],
  });
});
