/**
 * Splitter tests
 */

import { AstNode } from "langium";
import { createServicesForGrammar } from "langium/grammar";
import { describe, expect, it } from "vitest";
import { splitByNode, splitByNodeToAst } from "../src/splitter/splitter.js";
import { ProgramMapper } from "../src/splitter/program-map.js";

// create test services
const domainModelServices = await createServicesForGrammar({
  grammar: `
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

hidden terminal WS: /\\s+/;
terminal ID: /[_a-zA-Z][\\w_]*/;

hidden terminal ML_COMMENT: /\\/\\*[\\s\\S]*?\\*\\//;
hidden terminal SL_COMMENT: /\\/\\/[^\\n\\r]*/;
`,
  languageMetaData: {
    languageId: "domainmodel",
    fileExtensions: [""],
    caseInsensitive: false,
    mode: "development",
  },
});

/**
 * Mock model for splitting
 */
const sampleModel = `
package foo.bar {
    datatype String
    datatype Int

    entity Person {
        name: String
        age: Int
    }

    entity Company {
        name: String
    }
}
`;

/**
 * With comments to test out comment retention 
 */
const modelWithComments = `
package test {
    // single line comment
    datatype String

    /** Multi-line comment
     * for Entity
     */
    entity Person {
        name: String
    }

    /**
     * Multi-line comment for company
     */
    entity Company {
        name: String
    }
}
`;

describe("splitByNode", () => {
  describe("Basic splitting", () => {
    it("should split by entity nodes", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(sampleModel, isEntity, domainModelServices);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain("entity Person");
      expect(chunks[1]).toContain("entity Company");
    });

    it("should split by datatype nodes", () => {
      const isDataType = (node: AstNode) => node.$type === "DataType";
      const chunks = splitByNode(sampleModel, isDataType, domainModelServices);
      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain("datatype String");
      expect(chunks[1]).toContain("datatype Int");
    });

    it("should split by package nodes", () => {
      const isPackage = (node: AstNode) => node.$type === "PackageDeclaration";
      const chunks = splitByNode(sampleModel, isPackage, domainModelServices);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain("package foo.bar");
    });

    it("should split by multiple predicates", () => {
      const predicates = [
        (node: AstNode) => node.$type === "Entity",
        (node: AstNode) => node.$type === "DataType",
      ];
      const chunks = splitByNode(sampleModel, predicates, domainModelServices);

      // should get a pair of datatypes & entities (4)
      expect(chunks.length).toBe(4);
    });

    it("should handle no matching nodes", () => {
      const neverMatch = (_node: AstNode) => false;
      const chunks = splitByNode(sampleModel, neverMatch, domainModelServices);
      expect(chunks).toHaveLength(0);
    });

    it("should filter out empty chunks", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(sampleModel, isEntity, domainModelServices);

      // verify chunks are non-empty
      for (const chunk of chunks) {
        expect(chunk.trim().length).toBeGreaterThan(0);
      }
    });
  });

  /**
   * Block for checking how we handle comments that should belong
   * to chunks broken up by AST type
   */
  describe("Comment handling", () => {
    it("should include comments with default settings", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(
        modelWithComments,
        isEntity,
        domainModelServices,
      );

      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain("Multi-line comment");
      expect(chunks[1]).toContain("company");
    });

    it("should include single-line comments when requested", () => {
      const isDataType = (node: AstNode) => node.$type === "DataType";
      const chunks = splitByNode(
        modelWithComments,
        isDataType,
        domainModelServices,
        { commentRuleNames: ["ML_COMMENT", "SL_COMMENT"] },
      );

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain("single line comment");
    });

    it("should exclude comments when commentRuleNames is undefined", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(
        modelWithComments,
        isEntity,
        domainModelServices,
        { commentRuleNames: undefined },
      );

      expect(chunks.length).toBe(2);
      expect(chunks[0]).not.toContain("Multi-line comment");
      expect(chunks[1]).not.toContain("Multi-line comment");
    });

    it("should handle custom comment rule names", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(
        modelWithComments,
        isEntity,
        domainModelServices,
        { commentRuleNames: ["ML_COMMENT"] },
      );

      expect(chunks.length).toBe(2);
      expect(chunks[0]).toContain("Multi-line comment");
      expect(chunks[1]).toContain("company");
    });
  });

  describe("Edge cases", () => {
    it("should handle empty document", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode("", isEntity, domainModelServices);

      expect(chunks).toHaveLength(0);
    });

    it("should handle whitespace-only document", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(
        "   \n\n  \t  ",
        isEntity,
        domainModelServices,
      );

      expect(chunks).toHaveLength(0);
    });

    it("should handle document with parse errors", () => {
      const invalidDoc = "package { entity }}}";
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(invalidDoc, isEntity, domainModelServices);

      // should return empty array due to parse errors
      expect(Array.isArray(chunks)).toBe(true);
    });

    it("should handle document with only comments", () => {
      const commentsOnly = "// just a comment\n/* another comment */";
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(commentsOnly, isEntity, domainModelServices);

      expect(chunks).toHaveLength(0);
    });

    it("should handle nested structures", () => {
      const nestedModel = `
                package outer {
                    entity Outer {
                        field: String
                    }
                }
            `;
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const chunks = splitByNode(nestedModel, isEntity, domainModelServices);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain("entity Outer");
    });
  });
});

describe("splitByNodeToAst", () => {
  describe("AST node return", () => {
    it("should return AST nodes not text", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const nodes = splitByNodeToAst(
        sampleModel,
        isEntity,
        domainModelServices,
      );

      expect(nodes.length).toBe(2);
      expect(nodes[0].$type).toBe("Entity");
      expect(nodes[1].$type).toBe("Entity");
    });

    it("should return nodes with correct structure", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const nodes = splitByNodeToAst(
        sampleModel,
        isEntity,
        domainModelServices,
      );

      nodes.forEach((node) => {
        expect(node).toHaveProperty("$type");
        expect(node).toHaveProperty("$cstNode");
        expect(node).toHaveProperty("$container");
      });
    });

    it("should work with single predicate", () => {
      const isDataType = (node: AstNode) => node.$type === "DataType";
      const nodes = splitByNodeToAst(
        sampleModel,
        isDataType,
        domainModelServices,
      );

      expect(nodes.length).toBe(2);
      expect(nodes[0].$type).toBe("DataType");
    });

    it("should work with array of predicates", () => {
      const predicates = [
        (node: AstNode) => node.$type === "Entity",
        (node: AstNode) => node.$type === "DataType",
      ];
      const nodes = splitByNodeToAst(
        sampleModel,
        predicates,
        domainModelServices,
      );

      expect(nodes.length).toBe(4); // 2 datatypes + 2 entities
    });
  });

  describe("Predicate matching", () => {
    it("should filter nodes correctly", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const nodes = splitByNodeToAst(
        sampleModel,
        isEntity,
        domainModelServices,
      );

      nodes.forEach((node) => {
        expect(node.$type).toBe("Entity");
      });
    });

    it("should return empty array when no nodes match", () => {
      const neverMatch = (_node: AstNode) => false;
      const nodes = splitByNodeToAst(
        sampleModel,
        neverMatch,
        domainModelServices,
      );

      expect(nodes).toHaveLength(0);
    });

    it("should return all matching nodes", () => {
      const isFeature = (node: AstNode) => node.$type === "Feature";
      const nodes = splitByNodeToAst(
        sampleModel,
        isFeature,
        domainModelServices,
      );

      // 2 features for person, 1 for company
      expect(nodes.length).toBe(3);
      for (const node of nodes) {
        expect(node.$type).toBe("Feature");
      }
    });

    it("should handle complex predicates", () => {
      const hasName = (node: AstNode) => {
        return node.$type === "Entity" && "name" in node;
      };
      const nodes = splitByNodeToAst(sampleModel, hasName, domainModelServices);

      expect(nodes.length).toBe(2);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty document", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const nodes = splitByNodeToAst("", isEntity, domainModelServices);

      expect(nodes).toHaveLength(0);
    });

    it("should handle whitespace-only document", () => {
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const nodes = splitByNodeToAst(
        "   \n\n  ",
        isEntity,
        domainModelServices,
      );

      expect(nodes).toHaveLength(0);
    });

    it("should handle documents with parse errors", () => {
      const invalidDoc = "package { entity }";
      const isEntity = (node: AstNode) => node.$type === "Entity";
      const nodes = splitByNodeToAst(invalidDoc, isEntity, domainModelServices);
      expect(nodes).toHaveLength(0);
    });
  });
});

describe("ProgramMapper", () => {
  describe("Basic mapping", () => {
    it("should map with single rule", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => `Entity: ${(node as unknown as { name: string }).name}`,
          },
        ],
      });

      const result = mapper.map(sampleModel);

      expect(result.length).toBe(2);
      expect(result[0]).toBe("Entity: Person");
      expect(result[1]).toBe("Entity: Company");
    });

    it("should map with multiple rules", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => `Entity: ${(node as unknown as { name: string }).name}`,
          },
          {
            predicate: (node: AstNode) => node.$type === "DataType",
            map: (node: AstNode) => `DataType: ${(node as unknown as { name: string }).name}`,
          },
        ],
      });

      const result = mapper.map(sampleModel);

      expect(result.length).toBe(4); // 2 datatypes + 2 entities
      expect(result).toContain("DataType: String");
      expect(result).toContain("DataType: Int");
      expect(result).toContain("Entity: Person");
      expect(result).toContain("Entity: Company");
    });

    it("should apply rules in order", () => {
      const order: string[] = [];
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "DataType",
            map: (node: AstNode) => {
              order.push("datatype");
              return `DataType: ${(node as unknown as { name: string }).name}`;
            },
          },
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => {
              order.push("entity");
              return `Entity: ${(node as unknown as { name: string }).name}`;
            },
          },
        ],
      });

      mapper.map(sampleModel);

      // datatypes appear before entities in the model
      expect(order[0]).toBe("datatype");
    });

    it("should return array of strings", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => `${(node as unknown as { name: string }).name}`,
          },
        ],
      });

      const result = mapper.map(sampleModel);

      expect(Array.isArray(result)).toBe(true);
      result.forEach((item) => {
        expect(typeof item).toBe("string");
      });
    });
  });

  describe("Mapping rules", () => {
    it("should pass correct nodes to map function", () => {
      let capturedNode: AstNode | null = null;
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => {
              capturedNode = node;
              return "test";
            },
          },
        ],
      });

      mapper.map(sampleModel);

      expect(capturedNode).not.toBeNull();
      expect(capturedNode!.$type).toBe("Entity");
    });

    it("should allow custom map logic", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => {
              const name = (node as unknown as { name: string }).name;
              return name.toUpperCase();
            },
          },
        ],
      });

      const result = mapper.map(sampleModel);

      expect(result).toContain("PERSON");
      expect(result).toContain("COMPANY");
    });

    // accumulate based on feature counts
    it("should handle complex mapping logic", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => {
              const entity = node as unknown as { name: string; features?: unknown[] };
              const featureCount = entity.features?.length ?? 0;
              return `${entity.name} (${featureCount} features)`;
            },
          },
        ],
      });

      const result = mapper.map(sampleModel);

      expect(result).toContain("Person (2 features)");
      expect(result).toContain("Company (1 features)");
    });

    it("should handle multiple rules matching same node", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => `A: ${(node as unknown as { name: string }).name}`,
          },
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => `B: ${(node as unknown as { name: string }).name}`,
          },
        ],
      });

      const result = mapper.map(sampleModel);

      // both rules should match and produce results
      // 2 entities, 2 rules
      expect(result.length).toBe(4);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty document", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => `${(node as unknown as { name: string }).name}`,
          },
        ],
      });

      const result = mapper.map("");

      expect(result).toHaveLength(0);
    });

    it("should handle no matching rules", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (_node: AstNode) => false,
            map: (_node: AstNode) => "never",
          },
        ],
      });

      const result = mapper.map(sampleModel);

      expect(result).toHaveLength(0);
    });

    it("should handle empty mapping rules", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [],
      });

      const result = mapper.map(sampleModel);

      expect(result).toHaveLength(0);
    });

    it("should handle malformed documents", () => {
      const mapper = new ProgramMapper(domainModelServices, {
        mappingRules: [
          {
            predicate: (node: AstNode) => node.$type === "Entity",
            map: (node: AstNode) => `${(node as unknown as { name: string }).name}`,
          },
        ],
      });

      const result = mapper.map("invalid { syntax }");

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });
});
