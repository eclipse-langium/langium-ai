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

# embedding model
ollama pull mxbai-embed-large
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

If you want to run a more comprehensive langium example with & without RAG, you can run:

```sh
# make sure to first build embeddings in the example-dsl-splitter project!
# these will be utilized in this phase

# additionally make sure to pull down llama3.1 for this one
ollama pull llama3.1

npm run start -- run-langium
```

And lastly you can skip right to generating a radar chart report from the last results (which is automatically generated at the end of each of these runs):

```sh
npm run start -- report
```
