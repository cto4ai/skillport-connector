## Writing Guidelines

- Avoid negative statements about Anthropic, Claude, Skills, etc. No problems (or, therefore, solutions), limitations, etc. Frame things as "building on Anthropic's great work", "extended the great platform", "applying the concept from Anthropic's X to Y."
- Use the tone of voice of Ethan Mollick. See the linkedin-post-plain skill, /references/style-guide.md for the style we're looking for.

## Ranked Messaging

1. **Skill Distribution for All Claude Surfaces:** Building on Anthropic's great work with their shared Skill (plugin) Marketplace concept for Claude Code, Skillport brings similar advantages to Claude's other surfaces (Claude.ai on the web, Claude Desktop on Mac and Windows, Claude on mobile).
2. **Private Library Support:** With Skillport, shared skill libraries can be private-to-your-organization--repos don't need to be public.
3. **Claude OAuth Connector:** Skillport Connector is fully Claude Connector compatible, including supporting OAuth authentication. Skillport Connector has extremely low context overhead, because it exposes only a single tool and applies concepts from Anthropic's Programmable Tool Calling and Advanced Tool Use, has extremely low context overhead as well as excellent performance.
4. **Skillport Meta-Skill;** Skillport operates using its own powerful Skill that supports both Skill Consumers (find, install, update skills) and Creators
5. **Open Source:** Fully open source under the unrestrictive MIT license.
6. **Skill Versioning for All:** Skillport brings Skill versioning to Claude's non-developer surfaces Claude.ai and Claude Desktop.
7. **Claude Plugin Marketplace Compliant GitHub Template:** The Skillport Marketplace repository is fully compliant with Anthropic's Plugin Marketplace standard. It is a GitHub Public Template that exposes the "Use this template" button in GitHub.

## Recent Developments

### Early Jan:

- Connector
  - Super low overhead, high performance connector (a single tool), which leverages code execution in a PTC/Advanced Tool Calling-like manner within Claude direct model operation
    - Best we can do without the full toolkit of API tools from Anthropic
  - Skill invocation is now consistent: the new Skillport Skill is consistently used by the model, rather than being bypassed with the model calling Connector tools directly; critical for more intelligent operation, such as enabling rules like "make sure you always get user's positive assent before writes to repo."
- Marketplace and Skills
  - Confirmed repo compatibility with Anthropic's Plugin Marketplace format. A public repo based on the Skillport Marketplace can be accessed in Claude Code via the /plugin command. (As well as via Skillport Connector!)
  - The new Skillport Skill improves significantly over previous Skillport Manager skill
    - Thoroughly trains model in the API exposed through Skillport Connect for PTC/Advance Tool Calling-like low-context-overhead, high performance operation
    - More compliant with Anthropic best practices such is conciseness, use of 3rd party voice, and progressive disclosure
    - Includes extensive Skill Best Practices guide to support high quality skill creation

### Late Dec:

- Refined naming: Skillport (overall solution); Skillport Connector (Claude compatible Connector); Skillport Marketplace (Claude Plugin Marketplace compatible skill repository template)
- We have iterated significantly on the Skillport Marketplace repository structure to make sure it follows Anthropic's Plugin Marketplace structure.
- We are open-sourcing Skillport under the permissive MIT license. Both the Skillport Connector https://github.com/cto4ai/skillport-connector and Skillport Marketplace https://github.com/cto4ai/skillport-marketplace repos will soon be public under that license.
- We have done extensive work to make it easy for organizations and individuals to set up their own private Skillport skill repositories using these two repos. skillport-connector is set up for easy forking so organizations can configured and deploy their own OAuth-enabled Skillport Connector. skillport-marketplace is a GitHub Template that supports "Use this template" to quickly set up a new private Skillport Marketplace repo to work with Skillport Connector.
- Skillport Connector now fully supports both skill consumers (those who need to find and install skills from their organization's shared skill library); and skill creators, who can create new skills, edit existing skills, and delete skills.
- Skillport now fully supports Claude Code, in addition to Claude.ai, Claude Desktop, Claude on mobile.
- We've applied Programatic Tool Calling (probably incorrect term but in the ballpark) to radically reduce context overhead and improve performance of the Skillport Connector.
- Skillport allows organizations to share Claude Code skills across the organization, without the skill repository needing to be public (as is currently the case with Plugin Marketplaces).
