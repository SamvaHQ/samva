import configuration from "./configuration";
import instructions from "./instructions.md";
import { createOnboardingAgent } from "./module";
import onboardingSkill from "./skills/onboarding.md";

export default createOnboardingAgent(configuration, instructions, onboardingSkill);
