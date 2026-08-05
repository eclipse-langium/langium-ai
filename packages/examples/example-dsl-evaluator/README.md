# Example DSL Evaluator

A concrete usage of langium-ai-tools to help evaluate output from an LLM (and its related setup) in the context of the example dsl in this project.

## Installation

Install via npm to setup the project & build

```sh
npm install
npm run build
```

This demo needs **Ollama** installed & running, with the following models pulled (but feel free to adjust these to your needs):

```sh
# chat + code gen models
ollama pull codellama
ollama pull llama3.2
ollama pull codegemma

# embedding model (used for the embedding evaluator and RAG)
ollama pull nomic-embed-text
```

## Building

To build the project, run the following command:

```sh
npm run build
```

## Running

You can run an example evaluation with `npm run demo`. This will run a pre-defined validation suite for an example (shown at LangDev 24'), and open up the generated radar chart report.

You can also run specific evaluations with the following commands:

```sh
# runs the langdev evaluation example
npm run start -- run-langdev
```

## Running with RAG

The `run-langium` example includes runners that use Retrieval-Augmented Generation (RAG). These
retrieve context from a [ChromaDB](https://www.trychroma.com/) collection before prompting the model,
so you need a running Chroma server with a seeded collection first.

### 1. Start ChromaDB

A `docker-compose.yml` is included to run Chroma locally on `http://localhost:8000`. Requires
[Docker](https://docs.docker.com/get-docker/).

```sh
# start the Chroma server (waits until it's ready)
npm run chroma:up

# ...and later, to stop it
npm run chroma:down
```

### 2. Seed the collection

The `seed` script splits an example Langium grammar into per-rule chunks using the langium-ai-tools
splitter, embeds each chunk with `nomic-embed-text` via Ollama, and stores them in the
`langium-collection` collection that the RAG runners query. It is safe to re-run (it recreates the
collection each time).

```sh
# make sure Chroma is up and `nomic-embed-text` is pulled first
npm run seed
```

### 3. Run the RAG evaluation

```sh
# additionally make sure to pull down llama3.1 for this one
ollama pull llama3.1

npm run start -- run-langium
```

## Reports

You can skip right to generating a radar chart report from the last results (which is automatically
generated at the end of each evaluation run):

```sh
npm run start -- report
```

## Other examples

```sh
# demonstrate the splitter on a sample grammar
npm run start -- splitter

# generate a program map from a sample program
npm run start -- program-map
```
