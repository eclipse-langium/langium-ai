/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Structural type definitions for the Langium service layer.
 *
 * The LangiumServices type is a fairly volatile part of langium's API,
 * changing shape across releases. These structure props try to isolate to
 * only the parts we're interested in, so langium-ai-tools can work with any
 * langium 4.x release
 *
 * Stable langium types (AstNode, URI, CstUtils, etc.) are imported directly
 * from the langium peer dependency — only the service types are abstracted here.
 */

import type { AstNode, Grammar, LangiumDocument } from 'langium';

// ---------------------------------------------------------------------------
// Service types (volatile surface)
// ---------------------------------------------------------------------------

export interface LangiumDocumentFactoryLike {
    fromString(text: string, uri: unknown): LangiumDocument<AstNode>;
}

export interface DocumentBuilderLike {
    build(documents: LangiumDocument[], options?: { validation?: boolean }): Promise<void>;
}

export interface SharedWorkspaceLike {
    LangiumDocumentFactory: LangiumDocumentFactoryLike;
    DocumentBuilder: DocumentBuilderLike;
    LangiumDocuments: unknown;
}

export interface SharedServicesLike {
    workspace: SharedWorkspaceLike;
}

export interface LanguageMetaDataLike {
    fileExtensions: readonly string[];
}

/**
 * Structural representation of the LangiumServices shape we consume.
 */
export interface LangiumServicesLike {
    LanguageMetaData: LanguageMetaDataLike;
    Grammar: Grammar;
    shared: SharedServicesLike;
}
