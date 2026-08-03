import { expect, test } from "bun:test";
import { bumpBetween, bumpRank, compareVersions, parseSemver } from "./version.ts";

test("a version parses into its three numeric fields, or into nothing", () => {
	expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });

	// No pre-release, no build metadata, no `v`: a package is published or it is not.
	for (const text of ["1.0.0-rc.1", "v1.0.0", "1.0", "1.0.0+build", "", "latest"]) {
		expect(parseSemver(text)).toBeNull();
	}
});

test("versions compare numerically, which is where string ordering fails", () => {
	expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
	expect("1.10.0" > "1.9.0").toBe(false);

	expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
	expect(compareVersions("1.0.1", "1.0.1")).toBe(0);
	// Sorting descending is how the catalog picks "latest", so that is what is pinned here.
	expect(["1.0.0", "1.10.0", "1.2.0"].sort((a, b) => compareVersions(b, a))[0]).toBe("1.10.0");
});

test("an unreadable version sorts below every readable one, so it can never be latest", () => {
	expect(compareVersions("not-a-version", "0.0.1")).toBeLessThan(0);
	expect(["0.0.1", "not-a-version"].sort((a, b) => compareVersions(b, a))[0]).toBe("0.0.1");
});

test("a bump names the field that moved", () => {
	expect(bumpBetween("1.0.0", "2.0.0")).toBe("major");
	expect(bumpBetween("1.0.0", "1.1.0")).toBe("minor");
	expect(bumpBetween("1.0.0", "1.0.1")).toBe("patch");
	// A major bump that also moves minor and patch is still a major bump.
	expect(bumpBetween("1.4.2", "2.0.0")).toBe("major");
});

test("anything that is not an increase is not a bump at all", () => {
	expect(bumpBetween("1.0.0", "1.0.0")).toBeNull();
	expect(bumpBetween("1.1.0", "1.0.9")).toBeNull();
	expect(bumpBetween("1.0.0", "nonsense")).toBeNull();
});

test("bumps rank by how much they oblige a client to do", () => {
	expect(bumpRank("major")).toBeGreaterThan(bumpRank("minor"));
	expect(bumpRank("minor")).toBeGreaterThan(bumpRank("patch"));
});
