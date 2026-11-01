import { deploymentErrors } from "../lib/deployment-config.mjs";
// Vercel injects these variables before the build. Local builds need no remote credentials.
if (process.env.VERCEL === "1") {
  const errors = deploymentErrors(process.env);
  if (errors.length) {
    console.error(
      "Vercel deployment configuration is incomplete:\n" +
        errors.map((error) => `- ${error}`).join("\n") +
        "\nSet the five variables in Vercel Project Settings > Environment Variables, then redeploy. Run supabase/setup.sql in your Supabase project before opening the app.",
    );
    process.exitCode = 1;
  } else console.log("Vercel environment configuration verified.");
} else console.log("Local build: Vercel environment validation is skipped.");
