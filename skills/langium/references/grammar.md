# Grammar authoring and lexing

## When to read this

Read this when you write or change a `.langium` grammar, design the AST shape, fight parser or lexer errors, or need a lexing recipe (keywords as identifiers, indentation, case-insensitivity, value conversion). After every grammar edit run `npm run langium:generate` (see [project-setup.md](project-setup.md)).

## Contents

1. [Grammar skeleton](#grammar-skeleton)
2. [Expressions with infix rules](#expressions-with-infix-rules)
3. [Cross-references and multi-references](#cross-references-and-multi-references)
4. [Declared vs inferred types](#declared-vs-inferred-types)
5. [Actions, fragments, parameterized rules](#actions-fragments-and-parameterized-rules)
6. [Unordered groups and modifiers](#unordered-groups-and-modifiers)
7. [Line-based languages and EOF](#line-based-languages-and-eof)
8. [Lexing recipes](#lexing-recipes)
9. [Best practices](#best-practices)
10. [Pitfalls](#pitfalls)
11. [Source and examples](#source-and-examples)

## Grammar skeleton

Start every language from this shape. One `entry` rule per language, `name=` on everything that can be referenced, hidden terminals for whitespace and comments.

```langium
grammar Library

entry Model:
    (books+=Book | authors+=Author)*;

Author:
    'author' name=ID;

Book:
    'book' name=ID 'by' author=[Author:ID] ('pages' pages=INT)? ';';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
```

Assignments: `=` single value, `+=` array, `?=` boolean that is `true` when the right side was parsed. Terminal return types are `string` (default), `number`, `boolean`, `bigint`, `Date`.

Split large grammars with `import './types';` (no file extension). Imported files may omit the `grammar` header but then cannot contain an `entry` rule. Grammar names must be unique across imports, and no type may share the grammar's name (both are errors).

## Expressions with infix rules

Use `infix` for binary operators. It is shorter than the action-based pattern and parses about 50% faster. Syntax: `infix Name on OperandRule: ops > ops > ...;`.

**The first group binds tightest.** `>` separates precedence levels from highest to lowest. Groups are left-associative unless prefixed with `right assoc` (or `left assoc`). There is no `right-assoc` keyword and no per-operator parentheses.

```langium
Expression:
    BinaryExpression;

infix BinaryExpression on Unary:
    right assoc '^'             // highest precedence
    > '*' | '/' | '%'
    > '+' | '-'
    > '<' | '<=' | '>' | '>='
    > '==' | '!='
    > '&&'
    > '||';                     // lowest precedence

Unary infers Expression:
    {infer UnaryExpression} operator=('-' | '!') operand=Unary
    | Primary;

Primary infers Expression:
    '(' Expression ')'
    | {infer NumberLiteral} value=NUMBER
    | {infer VariableRef} variable=[Variable:ID];
```

This parses `2 ^ 3 ^ 2 * 4 - -1` as `((2 ^ (3 ^ 2)) * 4) - (-1)`. The generated `BinaryExpression` always has `left`, `operator` (a union of the operator literals) and `right`. `Expression` becomes the union `BinaryExpression | NumberLiteral | UnaryExpression | VariableRef`.

Notes:
- Put unary, postfix, and member access in the operand rule, not in the infix rule.
- `'(' Expression ')'` is an unassigned rule call, so parentheses leave no node in the AST.
- With a declared return type (`infix BinaryExpression on Unary returns BinaryExpr:`) the interface must declare `left`, `operator` (string or union of literals), and `right`.
- Member access and calls chain with a tree-rewriting action in the operand rule. The rule must `infers Expression`, otherwise `receiver` is typed as the primary type only. Resolving `member` needs custom scoping ([scoping.md](scoping.md)):

  ```langium
  Postfix infers Expression:
      Primary ({infer MemberAccess.receiver=current} '.' member=[Member:ID])*;
  ```
- The classic tree-rewriting form `Primary ({infer Add.left=current} '+' right=Primary)*` still works. Use it only when you need operator-specific node types.

## Cross-references and multi-references

```langium
Feature:
    name=ID ':' type=[Type:QualifiedName];      // Reference<Type>, resolved by name
Ref:
    target=[Element];                           // token taken from Element's name= rule
Entity:
    'entity' name=ID ('extends' superType=[+Entity:QualifiedName])?;  // MultiReference<Entity>

QualifiedName returns string:
    ID ('.' ID)*;

type Type = Entity | DataType;                  // reference several node types
```

- `[Type:TOKEN]` parses `TOKEN` and links it to a `Type` node. `[Type]` uses the terminal or data type rule of `Type`'s `name=` assignment; if there is none, generation fails with "Cannot infer terminal or data type rule for cross-reference".
- The `[Type|ID]` separator is deprecated and is an error. Use `:`.
- `Type` names a **type**, not a rule. To reference several node kinds, declare `type X = A | B;` instead of writing `[A:ID] | [B:ID]`, which is ambiguous.
- `[+Type:ID]` creates a `MultiReference<Type>`: `{ $refText, items: [{ ref }], error? }`. There is no `.ref`; iterate `items`. Use it for declarations that can legally appear more than once (partial classes, reopened namespaces). Resolution goes through the same `ScopeProvider`; see [scoping.md](scoping.md).
- Name the property after the target (`type`, `target`, `superType`), never `name`. A cross-reference assigned to `name` triggers a warning and breaks naming.

## Declared vs inferred types

**Recommendation:** prototype with inferred types; switch to declared types once validators, scoping, or generators are written against the AST. Declared types make the AST a contract: a grammar edit that would silently change a property becomes a grammar error instead of a TypeScript error somewhere else. Stay with inferred types only for throwaway or very small grammars.

To migrate, run `npx langium extract-types src/my-lang.langium` (writes `types.langium` next to the grammar), add `import './types';`, and change each rule to `RuleName returns TypeName:`. Set `"validation": { "types": "strict" }` in `langium-config.json` to forbid new inferred types.

```langium
interface NamedElement {
    name: string;
}
interface Entity extends NamedElement {
    abstract: boolean;              // ?= assignments
    superTypes: @Entity[];          // array of Reference<Entity>
    features: Feature[];
    doc?: string;                   // optional property
}
interface Feature extends NamedElement {
    type: @Type;                    // Reference<Type>
    visibility: Visibility = 'public';  // default, need not be assigned
}
interface EntityExtension extends NamedElement {
    target: @Entity+;               // MultiReference<Entity>
}
type Visibility = 'public' | 'private';
interface DataType extends NamedElement {}
type Type = Entity | DataType;

Entity returns Entity:
    (abstract?='abstract')? 'entity' name=ID
    ('extends' superTypes+=[Entity:QualifiedName] (',' superTypes+=[Entity:QualifiedName])*)?
    '{' features+=Feature* '}';
```

Rules: `returns T` needs an existing type, `infers T` creates one. A rule whose name equals a declared type still needs `returns` (error "The type 'X' is already explicitly declared and cannot be inferred"); the reverse error is "... is not explicitly declared and must be inferred". Actions use `{Entity}` for declared and `{infer Entity}` for inferred types. Several rules may return the same type; with inferred types their properties are merged and non-shared ones become optional.

## Actions, fragments, and parameterized rules

```langium
// one rule, several node types
Literal infers Expression:
    {infer StringLiteral} value=STRING | {infer NumberLiteral} value=NUMBER;

// a rule with only keywords creates no node; add an action
Wildcard:
    {infer Wildcard} '*';

// fragments inline shared assignments into the calling rule's node
fragment Named:
    name=ID ('as' alias=ID)?;
Import:
    'import' Named;

// guards: one rule, variants selected by boolean parameters
entry Model:
    elements+=Element<true>*;
Element<isRoot>:
    (<isRoot> isPublic?='public')?
    'element' name=ID '{' children+=Element<isRoot=false>* '}';
```

Guard conditions support `&`, `|`, `!` and can prefix alternatives: `(<isRoot> 'root' | <!isRoot> 'element')`. Arguments can be positional (`Element<false>`) or named (`Element<isRoot=false>`), but not mixed.

Data type rules (`QualifiedName returns string: ID ('.' ID)*;`) are parser rules that produce a primitive. Use them for qualified names, keywords as identifiers, and composite literals. They allow hidden tokens between parts and concatenate token text **without** whitespace, so `a . b` becomes `"a.b"`. If whitespace must be forbidden, use a terminal instead.

## Unordered groups and modifiers

`&` accepts its members in any order, each exactly once (`+` allowed). Optional members (`?`, `*`) are an error ("Optional elements in Unordered groups are currently not supported").

```langium
Book:
    'book' name=STRING (('isbn' isbn=STRING) & ('year' year=INT));
```

For optional modifiers in any order, use a repeated alternative and reject duplicates in a validator ([validation.md](validation.md)):

```langium
Class:
    modifiers+=('public' | 'abstract' | 'final')* 'class' name=ID;
```

Do not write `(abstract?='abstract' | final?='final')*`: it triggers "Found multiple assignments ... Consider using '+='".

## Line-based languages and EOF

Make newlines significant by not hiding them and accept `EOF` where the last line may lack one:

```langium
entry Lines:
    lines+=Line*;
Line:
    text=ID (EOL | EOF);

terminal ID: /[_a-zA-Z][\w_]*/;
terminal EOL: /\r?\n/;
hidden terminal WS: /[ \t]+/;
```

For block structure by indentation, use the indentation recipe below instead.

## Lexing recipes

The lexer runs before the parser and knows nothing about context. Keywords are matched first (longest first), then terminals **in declaration order**; the first terminal that matches wins, not the longest. A keyword does not split a longer identifier (`iffy` stays an `ID`).

### Order terminals from specific to general

```langium
terminal FLOAT returns number: /[0-9]+\.[0-9]+/;   // must come before INT
terminal INT returns number: /[0-9]+/;
```

With `INT` first, `1.5` lexes as `1`, then fails on `.` with "unexpected character". Every terminal that overlaps `ID` must come before `ID`. Terminals must not match the empty string.

### Keywords as identifiers

Any keyword anywhere in the grammar is never an `ID`. When `name=ID` must accept a keyword, list it in a data type rule and use that rule in the definition and the cross-reference:

```langium
Person:
    'person' name=PersonName;
Greeting:
    'Hello' person=[Person:PersonName] '!';

PersonName returns string:
    ID | 'Hello' | 'person';
```

Langium's own grammar does this with `FeatureName`. Keep the list short; each entry can create ambiguity. Then give the token a semantic token type so editors don't color it as a keyword ([lsp-features.md](lsp-features.md)). Alternative: allow an escape prefix such as `terminal ID: /\^?[_a-zA-Z][\w_]*/;`; the default value converter strips a leading `^` from `ID`.

### Indentation-sensitive languages

Register `IndentationAwareTokenBuilder` and `IndentationAwareLexer` together (the lexer throws without the builder). Declare `INDENT`/`DEDENT` terminals (their patterns are replaced) and split whitespace from newlines:

```langium
entry Statements:
    statements+=Statement*;
Statement:
    If | Return;
If:
    'if' condition=BOOLEAN ':' INDENT thenBlock+=Statement+ DEDENT
    ('else' ':' INDENT elseBlock+=Statement+ DEDENT)?;
Return:
    'return' value=BOOLEAN;

terminal BOOLEAN returns boolean: /true|false/;
terminal INDENT: 'synthetic:indent';
terminal DEDENT: 'synthetic:dedent';
hidden terminal WS: /[\t ]+/;
hidden terminal NL: /[\r\n]+/;
```

```ts
import { IndentationAwareLexer, IndentationAwareTokenBuilder, type Module } from 'langium';
import type { PartialLangiumServices } from 'langium/lsp';
import type { MyLangKeywordNames, MyLangTerminalNames } from './generated/ast.js';
import type { MyLangServices } from './my-lang-module.js';

export const MyLangModule: Module<MyLangServices, PartialLangiumServices> = {
    parser: {
        // generic parameters type-check the token names below
        TokenBuilder: () => new IndentationAwareTokenBuilder<MyLangTerminalNames, MyLangKeywordNames>({
            // no INDENT/DEDENT between these pairs; the names must be tokens of the grammar
            ignoreIndentationDelimiters: [['(', ')'], ['[', ']']],
        }),
        Lexer: (services) => new IndentationAwareLexer(services),
    },
};
```

Options and defaults: `indentTokenName: 'INDENT'`, `dedentTokenName: 'DEDENT'`, `whitespaceTokenName: 'WS'`, `ignoreIndentationDelimiters: []`. `INDENT` means "indentation increased", so place it once at block start, not before each statement.

### Case-insensitive languages

Set `"caseInsensitive": true` on the language in `langium-config.json` and regenerate. This only affects keywords, not names or references. For case-insensitive terminals add the `i` flag (`/[a-z_][a-z0-9_]*/i`). For case-insensitive name resolution, override the scope provider as shown in [scoping.md](scoping.md#recipe-case-insensitive-references).

### Custom value conversion

The `ValueConverter` turns token text into AST values. Defaults, by rule **name**: `STRING` strips the first and last character and unescapes, `INT` uses `parseInt`, `ID` strips a leading `^`. Otherwise by return type: `number` uses `Number()`, `boolean` is `true` only for the text `true` (case-insensitive), `bigint`, `Date`. Data type rules pass their concatenated text through the converter too. Override `runConverter` for anything else:

```ts
import { DefaultValueConverter, type CstNode, type GrammarAST, type ValueType } from 'langium';

export class MyLangValueConverter extends DefaultValueConverter {
    protected override runConverter(rule: GrammarAST.AbstractRule, input: string, cstNode: CstNode): ValueType {
        if (rule.name === 'YES_NO') {
            return input === 'yes';                          // terminal YES_NO returns boolean: /yes|no/;
        }
        if (rule.name === 'ESCAPED_ID') {
            return input.substring(1, input.length - 1);     // terminal ESCAPED_ID: /`[^`]+`/;
        }
        if (rule.name === 'QualifiedName') {
            return input.replaceAll('::', '.');              // data type rule
        }
        return super.runConverter(rule, input, cstNode);
    }
}
// module: parser: { ValueConverter: () => new MyLangValueConverter() }
```

## Best practices

- Regenerate after every grammar edit and never edit `generated/`. Commit generated files if your build does not run `langium generate`.
- Start each construct with a distinguishing keyword. It removes most ambiguity and gives completion something to propose.
- Use `infix` for binary operators and keep everything else in the operand rule.
- Use data type rules (`QualifiedName`, `PersonName`) rather than complex terminals whenever whitespace or keywords are involved; keep terminals few and simple, ordered specific to general.
- Use declared types for any language you will maintain; reference union types (`type X = A | B`) for cross-references to several kinds.
- Name rules in `UpperCamelCase`, terminals in `UPPER_CASE`, properties in `lowerCamelCase`. Avoid JavaScript reserved names and properties starting with `$`.
- Keep the default LL(*) lookahead. Set `chevrotainParserConfig.maxLookahead` only if you deliberately want LL(k) and its generate-time ambiguity checks.
- Add a parse test for each new construct ([testing.md](testing.md)), including inputs that must fail.

## Pitfalls

| Symptom | Cause and fix |
| --- | --- |
| `name` is never parsed when the text is a word like `type` or `Hello`; "Expecting token of type 'ID' but found `type`" | The word is a keyword somewhere in the grammar. Use a data type rule `Name returns string: ID \| 'type';` in definitions and cross-references |
| A terminal never matches, or "unexpected character" on valid input | An earlier terminal matched first (often `ID` or `INT`). Reorder from specific to general, or merge terminals |
| "Predicates are currently not supported." | `=>` and `->` predicates are parsed but rejected in 4.x. Remove them; disambiguate with a leading keyword, refactoring a common prefix into one rule, or guard parameters |
| Console prints "Ambiguous Alternatives Detected" at parse time and the wrong alternative wins | The default LL(*) parser commits to one of the ambiguous alternatives, and `langium generate` does not report it. Make alternatives start differently (keywords) or merge their common prefix into one rule. The message is suppressed in `production` mode, so check in development |
| `langium generate` fails with "Parser definition errors detected" / "Left Recursion found in grammar", or "An error occurred during validation: Maximum call stack size exceeded" | A rule calls itself before consuming a token. Use `infix` or the action pattern `A ({infer B.left=current} op right=A)*` |
| "This parser rule does not create an object" | The rule only has keywords or unassigned calls. Add `{infer X}` at the start or make it a data type rule with `returns string` |
| "Rule call 'X' requires assignment when parsed multiple times" | `X*` without assignment. Write `items+=X*` |
| "Found multiple assignments to 'p' with the '=' assignment operator" | The same property is assigned twice with `=` or `?=`; the last value wins. Use `+=` |
| "Optional elements in Unordered groups are currently not supported" | Remove `?`/`*` inside `&`; use the modifier pattern above |
| "Cannot infer terminal or data type rule for cross-reference" | `[Type]` target has no `name=` assignment. Write `[Type:ID]` |
| "'\|' is deprecated. Please, use ':' instead." | Change `[Type\|ID]` to `[Type:ID]` |
| `ref=([A:ID] \| [B:ID])` generates, but references to one kind never resolve; console shows "Ambiguous Alternatives Detected" | Both alternatives are just `ID`, so the parser always takes one. Declare `type AorB = A \| B;` and use `[AorB:ID]` |
| "The type 'X' is already explicitly declared and cannot be inferred" (or "X is a declared type and cannot be redefined" on an action) | Write `X returns X:` for rules and `{X}` instead of `{infer X}` for actions. "... must be inferred" means the opposite: use `infers`/`{infer X}` or declare the type |
| Qualified name `a . b` is accepted | Data type rules allow hidden tokens between parts. Validate the CST text or use a terminal if spacing matters |
| A `boolean` terminal is always `false` | The default converter accepts only `true`. Override `runConverter` |
| A terminal named `STRING` loses its first and last character | The converter matches `STRING`, `INT`, `ID` by name. Rename the terminal or override `runConverter` |
| Two grammars in one project define a type with the same name and its properties look mixed | Same-named types are merged into one interface without an error. Give each grammar's types distinct names ([multi-language.md](multi-language.md)) |
| "IndentationAwareLexer requires an accompanying IndentationAwareTokenBuilder" | Register both services in the same module |
| Changes to the grammar have no effect | Generation did not run or failed. Run `npm run langium:generate` and read its errors ([troubleshooting.md](troubleshooting.md)) |

## Source and examples

- Grammar of the grammar language: `node_modules/langium/src/grammar/langium-grammar.langium`
- Grammar validation messages: `node_modules/langium/src/grammar/validation/validator.ts`
- Lexing: `node_modules/langium/src/parser/token-builder.ts`, `node_modules/langium/src/parser/indentation-aware.ts`, `node_modules/langium/src/parser/value-converter.ts`
- Examples on GitHub (`eclipse-langium/langium/examples/...`): `arithmetics/src/language-server/arithmetics.langium` (infix, case-insensitive keywords), `domainmodel/src/language-server/domain-model.langium` (qualified names, multi-reference), `requirements/` (grammar imports across languages)
- Docs: https://langium.org/docs/reference/grammar-language/, https://langium.org/docs/reference/semantic-model/, https://langium.org/docs/reference/grammar-language/infix-operators/, https://langium.org/docs/recipes/keywords-as-identifiers/, https://langium.org/docs/recipes/lexing/indentation-sensitive-languages/, https://langium.org/docs/recipes/lexing/case-insensitive-languages/
