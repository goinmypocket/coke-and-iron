import { describe, it, expect } from "vitest";
import { stripComments } from "../../../src/engine/config/stripComments";

describe("stripComments", () => {
  it("removes _comment from a flat object", () => {
    expect(stripComments({ _comment: "hi", a: 1 })).toEqual({ a: 1 });
  });

  it("removes _comment recursively from nested objects", () => {
    const input = {
      _comment: "top",
      nested: {
        _comment: "inner",
        value: 42,
      },
    };
    expect(stripComments(input)).toEqual({ nested: { value: 42 } });
  });

  it("removes _comment inside arrays", () => {
    const input = [
      { _comment: "a", v: 1 },
      { _comment: "b", v: 2 },
    ];
    expect(stripComments(input)).toEqual([{ v: 1 }, { v: 2 }]);
  });

  it("preserves primitives and arrays without comment keys", () => {
    expect(stripComments(42)).toBe(42);
    expect(stripComments("hello")).toBe("hello");
    expect(stripComments(null)).toBe(null);
    expect(stripComments(true)).toBe(true);
    expect(stripComments([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("does not touch non-_comment keys named similarly", () => {
    const input = { _comments: "plural", comment: "no underscore" };
    expect(stripComments(input)).toEqual({
      _comments: "plural",
      comment: "no underscore",
    });
  });
});
