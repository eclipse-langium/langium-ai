/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EvalCase, Message } from "langium-ai-tools";

/**
 * Common history for all cases here
 */
const history: Message[] = [
    {
        role: 'system',
        content: `You are an expert in Langium grammars.
Your role is to provide accurate, detailed, and insightful explanations and advice on Langium grammar-related topics.
You will answer questions, provide examples, and offer guidance on best practices, ensuring clarity and precision in all responses.
For reference, here is a simple Langium grammar:

\`\`\`langium
// starts a grammar w/ a name
grammar HelloWorld

// entry parser rule
entry Model:
// parses a list of zero or more persons & greetings in any order
(persons+=Person | greetings+=Greeting)*;

// person parser rule
Person:
// parses a person keyword followed by an ID terminal (the person's name)
'person' name=ID;

// greeting parser rule
Greeting:
// parses Hello followed by a person reference and an exclamation mark at the end
'Hello' person=[Person:ID] '!';

// whitespace is a hidden terminal, i.e. ignored and not part of the AST
hidden terminal WS: /\s+/;
// ID is a terminal rule that matches this regex
terminal ID: /[_a-zA-Z][\w_]*/;

// multi-line & single-line comments are also hidden terminals
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`

Use this information to help answer questions about Langium grammars.
` }
];

export const cases: EvalCase[] = [
    {
        name: "Hello World Grammar",
        history,
        prompt: "Generate a simple HelloWorld grammar in Langium.",
        expected_response: `Certainly. Here's an example of a possible HelloWorld grammar written in the Langium grammar language:

\`\`\`langium
grammar HelloWorld

entry Model:
    (persons+=Person | greetings+=Greeting)*;

Person:
    'person' name=ID;

Greeting:
    'Hello' person=[Person:ID] '!';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`

This grammar defines a simple HelloWorld language with two parser rules: Person and Greeting. The entry rule Model allows for an arbitrary sequence of Person and Greeting elements. A Person is defined by the keyword 'person' followed by an ID terminal, which represents the person's name. A Greeting consists of the word 'Hello' followed by a reference to a Person and an exclamation mark. The grammar also includes terminal rules for whitespace, identifiers, and comments.`
    },
    {
        name: "StateMachine Grammar",
        history,
        prompt: "Create a simple Statemachine grammar in Langium.",
        expected_response: `Sure. Here's an example of a basic calculator grammar written in the Langium grammar language:

\`\`\`langium
grammar Statemachine

entry Statemachine:
    'statemachine' name=ID
    ('events' events+=Event+)?
    ('commands'    commands+=Command+)?
    'initialState' init=[State]
    states+=State*;

Event:
    name=ID;

Command:
    name=ID;

State:
    'state' name=ID
        ('actions' '{' actions+=[Command]+ '}')?
        transitions+=Transition*
    'end';

Transition:
    event=[Event] '=>' state=[State];

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

\`\`\`

This grammar defines a simple Statemachine language with events, commands, states, and an initial state. The Statemachine rule starts with the keyword 'statemachine' followed by an ID representing the name of the statemachine. It can include lists of events and commands, an initial state, and a sequence of states. Each event and command is defined by an ID. A state consists of a name, optional actions, and a list of zero or more transitions, followed by 'end'.
`
    },
    {
        name: 'Domain Model',
        history,
        prompt: 'Create a simple Domain Model grammar in Langium.',
        expected_response: `Here's an example of a Domain Model grammar written in the Langium grammar language:

\`\`\`langium
grammar DomainModel

entry Domainmodel:
    (elements+=AbstractElement)*;

AbstractElement:
    PackageDeclaration | Type;

PackageDeclaration:
    'package' name=QualifiedName '{'
        (elements+=AbstractElement)*
    '}';

Type:
    DataType | Entity;

DataType:
    'datatype' name=ID;

Entity:
    'entity' name=ID ('extends' superType=[Entity:QualifiedName])? '{'
        (features+=Feature)*
    '}';

Feature:
    (many?='many')? name=ID ':' type=[Type:QualifiedName];

QualifiedName returns string:
    ID ('.' ID)*;

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`

This grammar defines a Domain Model language with elements, package declarations, types, data types, entities, and features.
The entry rule Domainmodel allows for an arbitrary sequence of AbstractElement elements. 
An AbstractElement can be a PackageDeclaration or a Type. 
A PackageDeclaration starts with the keyword 'package' followed by a qualified name and a block of zero or more elements. 
A Type can be a DataType or an Entity. 
A DataType is defined by the keyword 'datatype' followed by an ID terminal.
An Entity is defined by the keyword 'entity' followed by an ID terminal, an optional super type, and a block of zero or more features. 
A Feature can be a single or multiple association with a type.
`
    },
    {
        name: 'Arithmetics',
        history,
        prompt: 'Create a simple Arithmetics grammar in Langium.',
        expected_response: `Here's an example of an Arithmetics grammar written in the Langium grammar language:

\`\`\`langium
grammar Arithmetics

entry Module:
    'module' name=ID
    (statements+=Statement)*;

Statement:
    Definition | Evaluation;

Definition:
    'def' name=ID ('(' args+=DeclaredParameter (',' args+=DeclaredParameter)* ')')?
    ':' expr=Expression ';';

DeclaredParameter:
    name=ID;

type AbstractDefinition = Definition | DeclaredParameter;

Evaluation:
    expression=Expression ';';

Expression:
    Addition;

Addition infers Expression:
    Multiplication ({infer BinaryExpression.left=current} operator=('+' | '-') right=Multiplication)*;

Multiplication infers Expression:
    Exponentiation ({infer BinaryExpression.left=current} operator=('*' | '/') right=Exponentiation)*;

Exponentiation infers Expression:
    Modulo ({infer BinaryExpression.left=current} operator='^' right=Modulo)*;

Modulo infers Expression:
    PrimaryExpression ({infer BinaryExpression.left=current} operator='%' right=PrimaryExpression)*;

PrimaryExpression infers Expression:
    '(' Expression ')' |
    {infer NumberLiteral} value=NUMBER |
    {infer FunctionCall} func=[AbstractDefinition] ('(' args+=Expression (',' args+=Expression)* ')')?;

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal NUMBER returns number: /[0-9]+(\.[0-9]*)?/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`

This grammar defines an Arithmetics language with expressions & definitions (functions). It effectively allows for regular arithmetic operations, including addition, subtraction, multiplication, division, exponentiation, and modulo operations.` 
    },
    {
        name: 'MiniLogo',
        history,
        prompt: `Create a simple MiniLogo grammar in Langium, using the MiniLogo language (very akin to Turtle in Python and the original Logo language).
It should support statements & definitions. The statements should be commands & macros, while the definitions should be named functions.
The only commands are pen, move, color, and for (a very simple loop mechanic like \`for x = 1 to 10 { ... }\`)`,
        expected_response: `Here's an example of a MiniLogo grammar written in the Langium grammar language.
This grammar supports statements and definitions for the MiniLogo language, which is similar to Turtle graphics.
The statements include commands like pen, move, color, and for, as well as macros for defining functions.
Here's the grammar:

\`\`\`langium
grammar MiniLogo

entry Model: (stmts+=Stmt | defs+=Def)*;

// Statements
Stmt:   Cmd | Macro;
Cmd:    Pen | Move | Color | For;
Macro:  def=[Def:ID] '(' (args+=Expr (',' args+=Expr)*)? ')';

// Definitions
Def:    'def' name=ID '(' (params+=Param (',' params+=Param)*)? ')' Block;

// Commands
Pen:    'pen' '(' mode=('up' | 'down') ')';
Move:   'move' '(' ex=Expr ',' ey=Expr ')';
Color:  'color' '(' ((r = Expr ',' g=Expr ',' b=Expr) | color=ID | color=HEX) ')';
For:    'for' var=Param '=' e1=Expr 'to' e2=Expr Block;


fragment Block: '{' body+=Stmt* '}';

Param: name=ID;


// Expressions
Expr: Add;

Add  infers Expr: 
    Mult     ({infer BinExpr.e1=current} op=('+'|'-') e2=Mult)*;
Mult infers Expr: 
    PrimExpr ({infer BinExpr.e1=current} op=('*'|'/') e2=PrimExpr)*;

PrimExpr: Lit | Ref | Group | NegExpr;

Lit:        val=NUMBER;
Ref:        val=[Param:ID];
Group:      '(' ge=Expr ')';
NegExpr:    '-' ne=Expr;

// Terminals
terminal HEX returns string:    /#(\d|[a-fA-F]){3,6}/;
terminal ID returns string:     /[_a-zA-Z][\w_]*/;
terminal NUMBER returns number:    /(?:(?:-?[0-9]+)?\.[0-9]+)|-?[0-9]+/;
hidden terminal WS:             /\s+/;
hidden terminal ML_COMMENT:     /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT:     /\/\/[^\n\r]*/;
\`\`\`

This grammar defines a MiniLogo language with statements and definitions. The Model rule allows for an arbitrary sequence of statements and definitions. A statement can be a command or a macro, while a definition is a named function. The commands include pen, move, color, and for, which is a simple loop mechanic. The expressions support arithmetic operations like addition, subtraction, multiplication, and division.
You can use this grammar to create MiniLogo programs for drawing shapes and patterns.
`
    }
];