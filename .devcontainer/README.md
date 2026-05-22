# Dev Container Setup

This dev container sets up an environment for developing web applications using PostgreSQL, Node, and TypeScript.

I used [this](https://code.visualstudio.com/docs/devcontainers/create-dev-container) tutorial along with [this](https://github.com/devcontainers/templates/tree/main/src/javascript-node-postgres) as the container starter.

Then I added some [features](https://containers.dev/features) like typescript, psql (postgres client), and tsx which is a way to run `.ts` tiles directly without having to compile them first.

Once the container is launched and the working folder open inside, you can install extensions by adding them to `devcontainer.json`.

Once you rebuild through the VSC command, the extensions will automatically be installed inside the container.
