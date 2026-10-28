import type { Scenario } from "../scenario";
import { startWorkspacesProjects } from "./start-workspaces-projects";
import { taskScenarios } from "./tasks";
import { viewPlanningScenarios } from "./views-planning";
import { productivityAdvancedScenarios } from "./productivity-advanced";
import { integrationSettingsScenarios } from "./integrations-settings";

/** One capture scenario per article with a video, keyed by article id. */
export const SCENARIOS: Record<string, Scenario> = {
  ...startWorkspacesProjects,
  ...taskScenarios,
  ...viewPlanningScenarios,
  ...productivityAdvancedScenarios,
  ...integrationSettingsScenarios,
};
