import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConstitutionalStore } from "#constitution/domain/store.js";
import { createInitiativeStore } from "#initiatives/domain/store.js";
import { createResearchStore } from "#research/domain/store.js";
import { findEntityByDisplayId, upsertEntityByDisplayIdWithLifecycleEvents } from "#storage/entities.js";
import { openWorkspaceStorage } from "#storage/workspace.js";
import { createTicketStore } from "#ticketing/domain/store.js";
import { parseMarkdownArtifact } from "../domain/frontmatter.js";
import { createDocumentationStore } from "../domain/store.js";

describe("DocumentationStore durable memory", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "pi-docs-store-"));
    process.env.PI_LOOM_ROOT = join(workspace, ".pi-loom-test");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.PI_LOOM_ROOT;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("compiles documentation packets from linked context and appends durable revision history", async () => {
    const constitutionStore = createConstitutionalStore(workspace);
    const initiativeStore = createInitiativeStore(workspace);
    const researchStore = createResearchStore(workspace);
    const docsStore = createDocumentationStore(workspace);

    vi.setSystemTime(new Date("2026-03-15T11:00:00.000Z"));
    await constitutionStore.initLedger({ title: "Pi Loom" });
    await constitutionStore.updateVision({
      title: "Pi Loom",
      visionSummary: "Build durable AI coordination memory.",
      visionNarrative: "The system should preserve execution, review, and documentation understanding durably.",
    });
    await constitutionStore.updateRoadmap({
      strategicDirectionSummary: "Keep Loom memory layers truthful as the codebase evolves.",
      currentFocus: ["Critique", "Documentation"],
    });
    const roadmap = await constitutionStore.upsertRoadmapItem({
      title: "Documentation layer",
      status: "active",
      horizon: "now",
      summary: "Add durable high-level documentation memory after completed work.",
      rationale: "Mission-critical work needs repo-visible explanations that survive beyond chat.",
    });
    const roadmapId = roadmap.state.roadmapItems[0]?.id;
    expect(roadmapId).toBeDefined();
    if (!roadmapId) {
      throw new Error("Expected roadmap item id");
    }

    vi.setSystemTime(new Date("2026-03-15T11:05:00.000Z"));
    const initiative = await initiativeStore.createInitiative({
      title: "Documentation Memory",
      objective: "Add first-class documentation memory for high-level system understanding.",
      roadmapRefs: [roadmapId],
      risks: ["Docs could drift away from completed system reality."],
    });

    vi.setSystemTime(new Date("2026-03-15T11:10:00.000Z"));
    const research = await researchStore.createResearch({
      title: "Docs maintenance semantics",
      question: "How should durable docs updates run?",
      objective: "Design a bounded fresh-maintainer packet for docs.",
      conclusions: [
        "Documentation maintenance should run after implementation is complete in a fresh maintainer context.",
      ],
      openQuestions: ["How should future top-level docs sync be wired?"],
      initiativeIds: [initiative.state.initiativeId],
    });
    initiativeStore.setResearchIds(initiative.state.initiativeId, [research.state.researchId]);

    vi.setSystemTime(new Date("2026-03-15T11:15:00.000Z"));
    const doc = await docsStore.createDoc({
      title: "Documentation memory system",
      docType: "overview",
      summary: "Explain the durable documentation layer and when it should be updated.",
      sourceTarget: { kind: "initiative", ref: initiative.state.initiativeId },
      contextRefs: {
        roadmapItemIds: [roadmapId],
        initiativeIds: [initiative.state.initiativeId],
        researchIds: [research.state.researchId],
      },
      scopePaths: ["docs", "README.md", "docs/loom.md"],
      guideTopics: ["documentation-memory", "fresh-updater"],
      linkedOutputPaths: ["docs/loom.md"],
      updateReason: "Add the final Loom memory layer for durable high-level docs.",
    });

    expect(doc.state.docId).toBe("documentation-memory-system");
    expect(doc.summary.ref).toBe(`documentation:${doc.state.docId}`);
    expect(doc.overview.packetRef).toBe(`documentation:${doc.state.docId}:packet`);
    expect(doc.overview.documentRef).toBe(`documentation:${doc.state.docId}:document`);
    expect(doc.document).toContain("id: documentation-memory-system");
    expect(doc.document).toContain("type: overview");
    expect(doc.packet).toContain("Keep Loom memory layers truthful as the codebase evolves.");
    expect(doc.packet).toContain(initiative.state.initiativeId);
    expect(doc.packet).toContain(research.state.researchId);
    expect(doc.packet).toContain("Do not generate API reference docs");
    expect(doc.packet).toContain("Likely Sections To Update");

    vi.setSystemTime(new Date("2026-03-15T11:20:00.000Z"));
    const revised = await docsStore.updateDoc(doc.state.docId, {
      updateReason: "Document the fresh-process updater and durable revision semantics.",
      summary: "Explains the docs packet, fresh updater, and durable revision history.",
      changedSections: ["Summary", "Update Flow", "Boundaries"],
      document: [
        "## Summary",
        "The documentation layer stores focused high-level docs in durable SQLite-backed memory and updates them after completed changes.",
        "",
        "## Update Flow",
        "A bounded packet is compiled from constitution, initiative, research, spec, ticket, and critique context before a fresh maintainer session updates the document.",
        "",
        "## Boundaries",
        "Documentation remains distinct from critique and from API reference generation.",
      ].join("\n"),
    });

    expect(revised.state.lastRevisionId).toBe("rev-001");
    expect(revised.revisions).toHaveLength(1);
    expect(revised.revisions[0]).toMatchObject({
      id: "rev-001",
      reason: "Document the fresh-process updater and durable revision semantics.",
      changedSections: ["Boundaries", "Summary", "Update Flow"],
    });
    expect(revised.overview.revisionCount).toBe(1);
    expect(revised.overview.lastRevision?.id).toBe("rev-001");
    expect(revised.overview.linkedOutputPaths.map((entry) => entry.displayPath)).toEqual([
      `${revised.summary.repository?.slug}:docs/loom.md`,
    ]);
    expect(revised.state.scopePaths.map((entry) => entry.displayPath)).toEqual(
      expect.arrayContaining([
        `${revised.summary.repository?.slug}:docs`,
        `${revised.summary.repository?.slug}:README.md`,
        `${revised.summary.repository?.slug}:docs/loom.md`,
      ]),
    );

    expect(revised.revisions[0]?.packetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(revised.document).toContain("type: overview");
    expect(revised.document).toContain("## Update Flow");
    expect(revised.document).toContain("Documentation remains distinct from critique");

    vi.setSystemTime(new Date("2026-03-15T11:25:00.000Z"));
    const correctedContextRefsRevision = await docsStore.updateDoc(doc.state.docId, {
      summary: "Explains the docs packet, fresh updater, revision events, and durable revision history.",
      updateReason: "Refresh the summary and correct the linked context refs.",
      contextRefs: {
        initiativeIds: [initiative.state.initiativeId],
      },
      guideTopics: ["documentation-memory", "fresh-updater", "revision-events"],
    });

    expect(correctedContextRefsRevision.revisions).toHaveLength(2);
    expect(correctedContextRefsRevision.revisions[1]).toMatchObject({
      id: "rev-002",
      reason: "Refresh the summary and correct the linked context refs.",
      changedSections: [],
      summary: "Explains the docs packet, fresh updater, revision events, and durable revision history.",
    });
    expect(correctedContextRefsRevision.state.contextRefs).toEqual({
      roadmapItemIds: [],
      initiativeIds: [initiative.state.initiativeId],
      researchIds: [],
      specChangeIds: [],
      ticketIds: [],
      critiqueIds: [],
    });
    expect(correctedContextRefsRevision.revisions[1]?.linkedContextRefs).toEqual(
      correctedContextRefsRevision.state.contextRefs,
    );
    expect(
      parseMarkdownArtifact(correctedContextRefsRevision.document, correctedContextRefsRevision.overview.documentRef)
        .body,
    ).toBe(parseMarkdownArtifact(revised.document, revised.overview.documentRef).body);
    expect(correctedContextRefsRevision.overview.revisionCount).toBe(2);
    expect(correctedContextRefsRevision.overview.lastRevision?.id).toBe("rev-002");

    vi.setSystemTime(new Date("2026-03-15T11:30:00.000Z"));
    const archived = await docsStore.archiveDoc(doc.state.docId);

    expect(archived.state.status).toBe("archived");
    expect(archived.state.lastRevisionId).toBe("rev-003");
    expect(archived.revisions).toHaveLength(3);
    expect(archived.revisions[2]).toMatchObject({
      id: "rev-003",
      reason: "Archive Documentation memory system after it stops describing the active system state.",
      changedSections: [],
      linkedContextRefs: correctedContextRefsRevision.state.contextRefs,
    });
    expect(archived.overview.revisionCount).toBe(3);
    expect(archived.overview.lastRevision?.id).toBe("rev-003");
    await expect(
      docsStore.updateDoc(doc.state.docId, {
        summary: "Archived docs must not accept further updates.",
      }),
    ).rejects.toThrow("Cannot update archived documentation");

    const { storage, identity } = await openWorkspaceStorage(workspace);
    const entity = await findEntityByDisplayId(storage, identity.space.id, "documentation", doc.state.docId);
    expect(entity?.attributes).toEqual({
      snapshot: {
        state: archived.state,
        revisions: archived.revisions,
        documentBody: [
          "## Summary",
          "The documentation layer stores focused high-level docs in durable SQLite-backed memory and updates them after completed changes.",
          "",
          "## Update Flow",
          "A bounded packet is compiled from constitution, initiative, research, spec, ticket, and critique context before a fresh maintainer session updates the document.",
          "",
          "## Boundaries",
          "Documentation remains distinct from critique and from API reference generation.",
        ].join("\n"),
      },
    });
    expect(entity?.attributes).not.toEqual(expect.objectContaining({ packet: expect.anything() }));
    expect(entity?.attributes).not.toEqual(expect.objectContaining({ document: expect.anything() }));
    expect(entity?.attributes).not.toEqual(expect.objectContaining({ overview: expect.anything() }));

    const events = await storage.listEvents(entity?.id ?? "missing");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_revision_recorded",
            revisionId: "rev-001",
            documentUpdated: true,
            changedSections: ["Boundaries", "Summary", "Update Flow"],
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_revision_recorded",
            revisionId: "rev-002",
            documentUpdated: false,
            changedSections: [],
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_revision_recorded",
            revisionId: "rev-003",
            documentUpdated: false,
            changedSections: [],
          }),
        }),
        expect.objectContaining({
          kind: "updated",
          actor: "documentation-store",
          payload: expect.objectContaining({
            change: "documentation_persisted",
            revisionCount: 3,
            lastRevisionId: "rev-003",
            status: "archived",
          }),
        }),
      ]),
    );

    const reread = await docsStore.readDoc(doc.state.docId);
    expect(reread.revisions).toEqual(archived.revisions);
    expect(reread.document).toBe(archived.document);
    expect(reread.packet).toBe(archived.packet);
    expect(reread.overview).toEqual(archived.overview);
  }, 120000);

  it("preserves legacy readability when stored docs predate governance metadata", async () => {
    const docsStore = createDocumentationStore(workspace);
    const { storage, identity } = await openWorkspaceStorage(workspace);
    const repository = identity.repository;
    expect(repository).toBeDefined();
    if (!repository) {
      throw new Error("Expected repository identity for legacy docs test.");
    }

    await upsertEntityByDisplayIdWithLifecycleEvents(
      storage,
      {
        kind: "documentation",
        spaceId: identity.space.id,
        owningRepositoryId: repository.id,
        displayId: "legacy-doc",
        title: "Legacy doc",
        summary: "Legacy docs remain readable during migration.",
        status: "active",
        version: 1,
        tags: ["overview"],
        attributes: {
          snapshot: {
            state: {
              docId: "legacy-doc",
              title: "Legacy doc",
              status: "active",
              docType: "overview",
              sectionGroup: "overviews",
              createdAt: "2026-03-20T10:00:00.000Z",
              updatedAt: "2026-03-20T10:00:00.000Z",
              summary: "Legacy docs remain readable during migration.",
              audience: ["ai", "human"],
              scopePaths: [],
              contextRefs: {
                roadmapItemIds: [],
                initiativeIds: [],
                researchIds: [],
                specChangeIds: [],
                ticketIds: [],
                critiqueIds: [],
              },
              sourceTarget: { kind: "workspace", ref: "repo" },
              updateReason: "Seed legacy readability test.",
              guideTopics: ["legacy-docs"],
              linkedOutputPaths: [],
              upstreamPath: null,
              lastRevisionId: null,
            },
            revisions: [],
            documentBody: "## Summary\nLegacy docs remain readable during migration.",
          },
        },
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z",
      },
      {
        actor: "test",
        createdPayload: { change: "seeded_legacy_doc" },
        updatedPayload: { change: "seeded_legacy_doc" },
      },
    );

    await expect(docsStore.readDoc("legacy-doc")).resolves.toMatchObject({
      state: {
        topicId: null,
        topicRole: "legacy",
        verifiedAt: null,
        verificationSource: null,
        successorDocId: null,
        retirementReason: null,
      },
      summary: {
        topicId: null,
        topicRole: "legacy",
        verifiedAt: null,
        successorDocId: null,
      },
      overview: {
        topicId: null,
        topicRole: "legacy",
        verifiedAt: null,
        verificationSource: null,
        successorDocId: null,
        retirementReason: null,
      },
    });
  });

  it("stores governed topic metadata and supersession links in canonical records", async () => {
    const docsStore = createDocumentationStore(workspace);

    vi.setSystemTime(new Date("2026-03-21T09:00:00.000Z"));
    const original = await docsStore.createDoc({
      title: "Curated docs governance",
      docType: "overview",
      topicId: "curated-documentation-governance",
      topicRole: "owner",
      summary: "Explain how one topic maps to one current overview.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-21T09:00:00.000Z",
      verificationSource: "ticket:pl-0124",
      guideTopics: ["docs-governance"],
      updateReason: "Seed the first governed overview.",
    });

    vi.setSystemTime(new Date("2026-03-21T09:05:00.000Z"));
    const successor = await docsStore.createDoc({
      title: "Curated docs governance v2",
      docType: "overview",
      topicId: "curated-documentation-governance",
      topicRole: "owner",
      summary: "The current canonical overview for docs governance.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-21T09:05:00.000Z",
      verificationSource: "ticket:pl-0124",
      guideTopics: ["docs-governance"],
      updateReason: "Publish the successor overview.",
    });

    vi.setSystemTime(new Date("2026-03-21T09:10:00.000Z"));
    const superseded = await docsStore.supersedeDoc(original.state.docId, {
      successorDocId: successor.state.docId,
      updateReason: "Supersede the original overview after publishing the successor.",
    });

    expect(superseded.state).toMatchObject({
      status: "superseded",
      topicId: "curated-documentation-governance",
      topicRole: "owner",
      verifiedAt: "2026-03-21T09:00:00.000Z",
      verificationSource: "ticket:pl-0124",
      successorDocId: successor.state.docId,
      retirementReason: null,
    });
    expect(superseded.summary).toMatchObject({
      topicId: "curated-documentation-governance",
      topicRole: "owner",
      verifiedAt: "2026-03-21T09:00:00.000Z",
      successorDocId: successor.state.docId,
    });
    expect(superseded.overview).toMatchObject({
      topicId: "curated-documentation-governance",
      topicRole: "owner",
      verifiedAt: "2026-03-21T09:00:00.000Z",
      verificationSource: "ticket:pl-0124",
      successorDocId: successor.state.docId,
      retirementReason: null,
    });
    expect(superseded.document).toContain("topic-id: curated-documentation-governance");
    expect(superseded.document).toContain(`successor: ${successor.state.docId}`);
    expect(superseded.packet).toContain("## Governance Metadata");
    expect(superseded.packet).toContain(`- lifecycle: successor=${successor.state.docId}`);

    await expect(
      docsStore.supersedeDoc(successor.state.docId, {
        successorDocId: original.state.docId,
      }),
    ).rejects.toThrow(`got superseded`);
  });

  it("curates listDocs defaults and requires explicit access for supporting or historical material", async () => {
    const docsStore = createDocumentationStore(workspace);

    vi.setSystemTime(new Date("2026-03-26T09:00:00.000Z"));
    const currentOwner = await docsStore.createDoc({
      title: "Governed topic overview",
      docType: "overview",
      topicId: "governed-topic",
      topicRole: "owner",
      summary: "Current owner for a governed topic.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-26T09:00:00.000Z",
      verificationSource: "manual:review",
    });

    vi.setSystemTime(new Date("2026-03-26T09:05:00.000Z"));
    const companion = await docsStore.createDoc({
      title: "Governed topic guide",
      docType: "guide",
      topicId: "governed-topic",
      summary: "Current companion guide beneath the governed topic owner.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-26T09:05:00.000Z",
      verificationSource: "manual:review",
    });

    vi.setSystemTime(new Date("2026-03-26T09:10:00.000Z"));
    const successorOwner = await docsStore.createDoc({
      title: "Replacement topic overview",
      docType: "overview",
      topicId: "replacement-topic",
      topicRole: "owner",
      summary: "Current owner for the replacement topic.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-26T09:10:00.000Z",
      verificationSource: "manual:review",
    });

    vi.setSystemTime(new Date("2026-03-26T09:15:00.000Z"));
    const supersededOwner = await docsStore.createDoc({
      title: "Retired replacement overview",
      docType: "overview",
      topicId: "replacement-topic",
      topicRole: "owner",
      summary: "Former owner that should become historical.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-26T09:15:00.000Z",
      verificationSource: "manual:review",
    });

    vi.setSystemTime(new Date("2026-03-26T09:20:00.000Z"));
    await docsStore.supersedeDoc(supersededOwner.state.docId, {
      successorDocId: successorOwner.state.docId,
      updateReason: "Move current truth to the replacement overview.",
    });

    vi.setSystemTime(new Date("2026-03-26T09:25:00.000Z"));
    const archivedGuide = await docsStore.createDoc({
      title: "Archived governed guide",
      docType: "guide",
      topicId: "replacement-topic",
      summary: "Historical guide that should stay hidden by default.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-26T09:25:00.000Z",
      verificationSource: "manual:review",
    });

    vi.setSystemTime(new Date("2026-03-26T09:30:00.000Z"));
    await docsStore.archiveDoc(archivedGuide.state.docId);

    vi.setSystemTime(new Date("2026-03-26T09:35:00.000Z"));
    const legacyGuide = await docsStore.createDoc({
      title: "Legacy migration guide",
      docType: "guide",
      summary: "Legacy readable guide that still needs topic metadata.",
      sourceTarget: { kind: "workspace", ref: "repo" },
    });

    vi.setSystemTime(new Date("2026-03-26T09:40:00.000Z"));
    const ownerlessGuide = await docsStore.createDoc({
      title: "Ownerless governed workflow",
      docType: "workflow",
      topicId: "ownerless-topic",
      summary: "Governed supporting doc that should require intentional access until an owner exists.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-26T09:40:00.000Z",
      verificationSource: "manual:review",
    });

    const defaultDiscovery = await docsStore.listDocs();
    expect(defaultDiscovery.map((summary) => summary.id)).toEqual(
      expect.arrayContaining([currentOwner.state.docId, successorOwner.state.docId, legacyGuide.state.docId]),
    );
    expect(defaultDiscovery.map((summary) => summary.id)).toEqual([
      successorOwner.state.docId,
      currentOwner.state.docId,
      legacyGuide.state.docId,
    ]);
    expect(defaultDiscovery.map((summary) => summary.id)).not.toContain(companion.state.docId);
    expect(defaultDiscovery.map((summary) => summary.id)).not.toContain(ownerlessGuide.state.docId);
    expect(defaultDiscovery.map((summary) => summary.id)).not.toContain(supersededOwner.state.docId);
    expect(defaultDiscovery.map((summary) => summary.id)).not.toContain(archivedGuide.state.docId);

    const guideDiscovery = await docsStore.listDocs({ docType: "guide" });
    expect(guideDiscovery.map((summary) => summary.id)).toEqual(
      expect.arrayContaining([companion.state.docId, legacyGuide.state.docId]),
    );
    expect(guideDiscovery.map((summary) => summary.id)).not.toContain(archivedGuide.state.docId);

    const supportingDiscovery = await docsStore.listDocs({ topic: "governed-topic", includeSupporting: true });
    expect(supportingDiscovery.map((summary) => summary.id)).toEqual([currentOwner.state.docId, companion.state.docId]);

    const ownerlessSupporting = await docsStore.listDocs({ topic: "ownerless-topic", includeSupporting: true });
    expect(ownerlessSupporting.map((summary) => summary.id)).toEqual([ownerlessGuide.state.docId]);

    const historicalDiscovery = await docsStore.listDocs({ includeHistorical: true, status: "superseded" });
    expect(historicalDiscovery.map((summary) => summary.id)).toContain(supersededOwner.state.docId);

    const archivedDiscovery = await docsStore.listDocs({ includeHistorical: true, status: "archived" });
    expect(archivedDiscovery.map((summary) => summary.id)).toContain(archivedGuide.state.docId);
  });

  it("classifies stale, overlapping, orphaned, and unverified governance drift", async () => {
    const docsStore = createDocumentationStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-24T09:00:00.000Z"));
    const sourceTicket = await ticketStore.createTicketAsync({
      title: "Documented execution slice",
      summary: "Provides the durable source target for the stale-doc scenario.",
    });

    vi.setSystemTime(new Date("2026-03-24T09:05:00.000Z"));
    await docsStore.createDoc({
      title: "Stale governed doc",
      docType: "overview",
      topicId: "stale-governed-doc",
      topicRole: "owner",
      summary: "A doc that will become stale after its source ticket changes.",
      sourceTarget: { kind: "ticket", ref: sourceTicket.summary.id },
      verifiedAt: "2026-03-24T09:05:00.000Z",
      verificationSource: `ticket:${sourceTicket.summary.id}`,
    });

    vi.setSystemTime(new Date("2026-03-24T09:10:00.000Z"));
    await ticketStore.updateTicketAsync(sourceTicket.summary.id, {
      summary: "The execution slice changed after the documentation review.",
    });

    vi.setSystemTime(new Date("2026-03-24T09:15:00.000Z"));
    await docsStore.createDoc({
      title: "Overlap one",
      docType: "overview",
      topicId: "overlap-topic",
      topicRole: "owner",
      summary: "First overlapping overview.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-24T09:15:00.000Z",
      verificationSource: "manual:review",
    });
    await docsStore.createDoc({
      title: "Overlap two",
      docType: "overview",
      topicId: "overlap-topic",
      topicRole: "owner",
      summary: "Second overlapping overview.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-24T09:15:00.000Z",
      verificationSource: "manual:review",
    });
    await docsStore.createDoc({
      title: "Orphaned doc",
      docType: "guide",
      summary: "Still missing governed ownership metadata.",
      sourceTarget: { kind: "workspace", ref: "repo" },
      verifiedAt: "2026-03-24T09:15:00.000Z",
      verificationSource: "manual:review",
    });
    await docsStore.createDoc({
      title: "Unverified doc",
      docType: "guide",
      topicId: "unverified-topic",
      topicRole: "companion",
      summary: "Missing review evidence.",
      sourceTarget: { kind: "workspace", ref: "repo" },
    });

    vi.setSystemTime(new Date("2026-03-24T09:20:00.000Z"));
    const audit = await docsStore.auditGovernance();

    expect(audit.subjects).toHaveLength(5);
    expect(audit.counts).toMatchObject({
      docsAudited: 5,
      findings: 4,
      byKind: {
        stale: 1,
        overlapping: 1,
        orphaned: 1,
        unverified: 1,
      },
    });
    expect(audit.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "stale",
          docIds: ["stale-governed-doc"],
          evidence: expect.arrayContaining([expect.stringContaining(`ticket:${sourceTicket.summary.id}`)]),
        }),
        expect.objectContaining({
          kind: "overlapping",
          docIds: ["overlap-one", "overlap-two"],
          severity: "high",
        }),
        expect.objectContaining({
          kind: "orphaned",
          docIds: ["orphaned-doc"],
          evidence: expect.arrayContaining([expect.stringContaining("migration-debt")]),
        }),
        expect.objectContaining({
          kind: "unverified",
          docIds: ["unverified-doc"],
          evidence: expect.arrayContaining([expect.stringContaining("no verifiedAt")]),
        }),
      ]),
    );
  });

  it("does not self-invalidate stale audits on verification-only refreshes", async () => {
    const docsStore = createDocumentationStore(workspace);
    const ticketStore = createTicketStore(workspace);

    vi.setSystemTime(new Date("2026-03-24T09:00:00.000Z"));
    const sourceTicket = await ticketStore.createTicketAsync({
      title: "Documented execution slice",
      summary: "Provides the durable source target for the verification refresh scenario.",
    });

    vi.setSystemTime(new Date("2026-03-24T09:05:00.000Z"));
    const documented = await docsStore.createDoc({
      title: "Verification refresh doc",
      docType: "overview",
      topicId: "verification-refresh-doc",
      topicRole: "owner",
      summary: "A governed doc whose verification metadata is refreshed without editing the body.",
      sourceTarget: { kind: "ticket", ref: sourceTicket.summary.id },
      verifiedAt: "2026-03-24T09:05:00.000Z",
      verificationSource: `ticket:${sourceTicket.summary.id}`,
    });

    vi.setSystemTime(new Date("2026-03-24T09:10:00.000Z"));
    await ticketStore.updateTicketAsync(sourceTicket.summary.id, {
      summary: "The execution slice changed after the initial documentation review.",
    });

    vi.setSystemTime(new Date("2026-03-24T09:15:00.000Z"));
    const refreshed = await docsStore.updateDoc(documented.state.docId, {
      verifiedAt: "2026-03-24T09:14:00.000Z",
      verificationSource: `ticket:${sourceTicket.summary.id}`,
      updateReason: "Refresh verification evidence after confirming the doc still matches the ticket.",
    });

    expect(refreshed.state.updatedAt).toBe("2026-03-24T09:05:00.000Z");
    expect(refreshed.state.verifiedAt).toBe("2026-03-24T09:14:00.000Z");
    expect(refreshed.revisions.at(-1)).toMatchObject({
      id: "rev-001",
      createdAt: "2026-03-24T09:15:00.000Z",
      changedSections: [],
      reason: "Refresh verification evidence after confirming the doc still matches the ticket.",
    });

    vi.setSystemTime(new Date("2026-03-24T09:20:00.000Z"));
    const audit = await docsStore.auditGovernance(documented.state.docId);

    expect(audit.counts).toMatchObject({
      docsAudited: 1,
      findings: 0,
      byKind: {
        stale: 0,
        overlapping: 0,
        orphaned: 0,
        unverified: 0,
      },
    });
    expect(audit.findings).toEqual([]);
  });
});
