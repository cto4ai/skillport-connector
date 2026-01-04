## Ranked Messaging

1.

## Guidelines

- Avoid negative statements about Anthropic, Claude, Skills, etc. No problems (or, therefore, solutions), limitations, etc. Frame things as "building on Anthropic's great work", "extended the great platform", "applying the concept from Anthropic's X to Y."
- Use the tone of voice of Ethan Mollick. See the linkedin-post-plain skill, /references/style-guide.md for the style we're looking for.

## New Developments

We have been working on a new readme for Skillport, which is located at README2.md. We've made a ton of progress since our last draft of that document.

### Key changes:

#### Early Jan:

- Connector
  - Super low overhead, high performance connector (a single tool), which leverages code execution in a PTC/Advance Tool Calling-like manner within Claude direct model operation
    - Best we can do without the full toolkit of API tools from Anthropic
  - Skill invocation is now consistent: the new Skillport Skill is consistently used by the model, rather than being bypassed with the model calling Connector tools directly; critical for more intelligent operation, such as enabling rules like "make sure you always get user's positive assent before writes to repo."
- Marketplace and Skills
  - Confirmed repo compatibility with Anthropic's Plugin Marketplace format. A public repo based on the Skillport Marketplace can be accessed in Claude Code via the /plugin command. (As well as via Skillport Connector!)
  - The new Skillport Skill improves significantly over previous Skillport Manager skill
    - Thoroughly trains model in the API exposed through Skillport Connect for PTC/Advance Tool Calling-like low-context-overhead, high performance operation
    - More compliant with Anthropic best practices such is conciseness, use of 3rd party voice, and progressive disclosure
    - Includes extensive Skill Best Practices guide to support high quality skill creation

#### Late Dec:

- Naming: Skillport (overall solution); Skillport Connector (Claude compatible Connector); Skillport Marketplace (Claude Plugin Marketplace compatible skill repository template)
- We have iterated significantly on the Skillport Marketplace repository structure to make sure it follows Anthropic's Plugin Marketplace structure.
- We are open-sourcing Skillport under the permissive MIT license. Both the Skillport Connector https://github.com/cto4ai/skillport-connector and Skillport Marketplace https://github.com/cto4ai/skillport-marketplace repos will soon be public under that license.
- We have done extensive work to make it easy for organizations and individuals to set up their own private Skillport skill repositories using these two repos. skillport-connector is set up for easy forking so organizations can configured and deploy their own OAuth-enabled Skillport Connector. skillport-marketplace is a GitHub Template that supports "Use this template" to quickly set up a new private Skillport Marketplace repo to work with Skillport Connector.
- Skillport Connector now fully supports both skill consumers (those who need to find and install skills from their organization's shared skill library); and skill creators, who can create new skills, edit existing skills, and delete skills.
- Skillport now fully supports Claude Code, in addition to Claude.ai, Claude Desktop, Claude on mobile.
- We've applied Programatic Tool Calling (probably incorrect term but in the ballpark) to radically reduce context overhead and improve performance of the Skillport Connector.
- Skillport allows organizations to share Claude Code skills across the organization, without the skill repository needing to be public (as is currently the case with Plugin Marketplaces).

for use on any Claude surface: , Claude Code)
