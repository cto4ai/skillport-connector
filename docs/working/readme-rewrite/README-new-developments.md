We have been working on a new readme for Skillport, which is located at README2.md. We've made a ton of progress since our last draft of that document. Key changes:

- Naming: Skillport (overall solution); Skillport Connector (Claude compatible Connector); Skillport Marketplace (Claude Plugin Marketplace compatible skill repository template)
- We have iterated significantly on the Skillport Marketplace repository structure to make sure it follows Anthropic's Plugin Marketplace structure.
- We are open-sourcing Skillport under the permissive MIT license. Both the Skillport Connector https://github.com/cto4ai/skillport-connector and Skillport Marketplace https://github.com/cto4ai/skillport-marketplace repos will soon be public under that license.
- We have done extensive work to make it easy for organizations and individuals to set up their own private Skillport skill repositories using these two repos. skillport-connector is set up for easy forking so organizations can configured and deploy their own OAuth-enabled Skillport Connector. skillport-marketplace is a GitHub Template that supports "Use this template" to quickly set up a new private Skillport Marketplace repo to work with Skillport Connector.
- Skillport Connector now fully supports both skill consumers (those who need to install skills from their organization's shared library for use on any Claude surface: Claude.ai, Claude Desktop, Claude on mobile, Claude Code); and skill creators, who can create new skills, edit existing skills, and delete skills.
- Skillport now fully supports Claude Code
- We've applied Programatic Tool Calling (probably incorrect term but in the ballpark) to radically reduce context overhead and improve performance of the Skillport Connector.
- Skillport allows organizations to share Claude Code skills across the organization, without the skill repository needing to be public (as is currently the case with Plugin Marketplaces).
- Because of how we've implemented the Skillport Connector, we no longer need a Claude Skill to be able to effectively discover, install, create, edit, and publish skills.
