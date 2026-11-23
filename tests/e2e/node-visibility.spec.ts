import { test, expect } from "@playwright/test";

test("hidden flags and display modes persist independently for technology and paper graphs, including cluster, timeline and focus views", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const id = spaces.find((s: { demo: boolean }) => s.demo).id;
  const original = await (await request.get(`/api/workspaces/${id}`)).json();
  const grades = ["landmark", "major", "normal", "minor"];
  const a = original.nodes[0];
  const b = original.nodes[1];
  const paper = original.papers.find((p: { id: string }) =>
    a.paperIds.includes(p.id),
  );
  await page.addInitScript(
    (id) => localStorage.setItem("anistudy.workspace", id),
    id,
  );
  const graphIds = () =>
    page
      .locator(".graph-node")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-node-id")!).sort(),
      );
  const modes = page.getByRole("group", { name: "节点显示模式", exact: true });
  const detail = page.getByRole("dialog", { name: "节点详情" });
  try {
    for (const [i, node] of original.nodes.entries())
      await request.patch(`/api/workspaces/${id}/nodes/${node.id}`, {
        data: { importance: grades[i] || "normal", hiddenInGraph: false },
      });
    await page.goto("/");
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    await expect(page.locator(".graph-node")).toHaveCount(
      original.nodes.length,
    );
    const positions = () =>
      page
        .locator(".graph-node")
        .evaluateAll((nodes) =>
          Object.fromEntries(
            nodes.map((n) => [
              n.getAttribute("data-node-id"),
              [n.getAttribute("data-x"), n.getAttribute("data-y")],
            ]),
          ),
        );
    const before = await positions();
    await page.locator(`.graph-node[data-node-id="${a.id}"]`).click();
    await detail
      .getByRole("checkbox", { name: "隐藏节点", exact: true })
      .check();
    await expect(
      detail.getByRole("checkbox", { name: "隐藏节点", exact: true }),
    ).toBeChecked();
    await detail.getByRole("button", { name: "关闭详情" }).click();
    await expect
      .poll(graphIds)
      .toEqual(original.nodes.map((n: { id: string }) => n.id).sort());
    await modes.getByRole("button", { name: "主要节点", exact: true }).click();
    await expect.poll(graphIds).toEqual(
      original.nodes
        .filter((n: { id: string }) => n.id !== a.id)
        .map((n: { id: string }) => n.id)
        .sort(),
    );
    await modes.getByRole("button", { name: "极简节点", exact: true }).click();
    await expect.poll(graphIds).toEqual([b.id]);
    await expect(
      modes.getByRole("button", { name: "极简节点", exact: true }),
    ).toHaveCSS("background-color", "rgb(45, 113, 95)");
    await page.screenshot({ path: "test-results/graph-minimal.png" });
    await page.getByRole("button", { name: "时间轴", exact: true }).click();
    await expect.poll(graphIds).toEqual([b.id]);
    await page.locator(`.graph-node[data-node-id="${b.id}"]`).click();
    await detail
      .getByRole("button", { name: "以此技术为中心", exact: true })
      .click();
    await expect.poll(graphIds).toEqual([b.id]);
    await page.reload();
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    await expect(
      modes.getByRole("button", { name: "极简节点", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect.poll(graphIds).toEqual([b.id]);
    await modes.getByRole("button", { name: "全部节点", exact: true }).click();
    await page.getByRole("button", { name: "关系聚类", exact: true }).click();
    expect(await positions()).toEqual(before);
    await page.locator(`.graph-node[data-node-id="${a.id}"]`).click();
    await expect(
      detail.getByRole("checkbox", { name: "隐藏节点", exact: true }),
    ).toBeChecked();
    await detail.getByRole("button", { name: "关闭详情" }).click();

    await page.getByRole("button", { name: "论文图谱", exact: true }).click();
    await expect(
      modes.getByRole("button", { name: "全部节点", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.locator(`.graph-node[data-node-id="${paper.id}"]`).click();
    await expect(
      detail.getByRole("checkbox", { name: "隐藏节点", exact: true }),
    ).toHaveCount(0);
    await request.patch(`/api/workspaces/${id}/papers/${paper.id}`, {
      data: { hiddenInGraph: true },
    });
    await page.reload();
    await page.getByRole("button", { name: "论文图谱", exact: true }).click();
    await expect
      .poll(graphIds)
      .toEqual(original.papers.map((p: { id: string }) => p.id).sort());
    await modes.getByRole("button", { name: "主要节点", exact: true }).click();
    await expect.poll(graphIds).toEqual(
      original.papers
        .filter((p: { id: string }) => p.id !== paper.id)
        .map((p: { id: string }) => p.id)
        .sort(),
    );
    const importantPaperIds = new Set([a, b].flatMap((n) => n.paperIds));
    await modes.getByRole("button", { name: "极简节点", exact: true }).click();
    await expect.poll(graphIds).toEqual(
      original.papers
        .filter(
          (p: { id: string }) =>
            p.id !== paper.id && importantPaperIds.has(p.id),
        )
        .map((p: { id: string }) => p.id)
        .sort(),
    );
    await page.reload();
    await page.getByRole("button", { name: "论文图谱", exact: true }).click();
    await expect(
      modes.getByRole("button", { name: "极简节点", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await modes.getByRole("button", { name: "全部节点", exact: true }).click();
    await page.locator(`.graph-node[data-node-id="${paper.id}"]`).click();
    await expect(
      detail.getByRole("checkbox", { name: "隐藏节点", exact: true }),
    ).toHaveCount(0);
    await detail.getByRole("button", { name: "关闭详情" }).click();
    await page.getByRole("button", { name: "技术图谱", exact: true }).click();
    await expect(
      modes.getByRole("button", { name: "全部节点", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const saved = await (await request.get(`/api/workspaces/${id}`)).json();
    expect(
      saved.nodes.find((n: { id: string }) => n.id === a.id).hiddenInGraph,
    ).toBe(true);
    expect(
      saved.papers.find((p: { id: string }) => p.id === paper.id).hiddenInGraph,
    ).toBe(true);
    expect(saved.papers).toHaveLength(original.papers.length);
    expect(saved.nodes).toHaveLength(original.nodes.length);
    expect(saved.edges).toEqual(original.edges);
  } finally {
    for (const node of original.nodes) {
      await request.patch(`/api/workspaces/${id}/nodes/${node.id}`, {
        data: {
          importance: node.importance,
          hiddenInGraph: !!node.hiddenInGraph,
        },
      });
      if (node.importanceSource !== "manual")
        await request.patch(`/api/workspaces/${id}/nodes/${node.id}`, {
          data: { importanceSource: "ai" },
        });
    }
    await request.patch(`/api/workspaces/${id}/papers/${paper.id}`, {
      data: { hiddenInGraph: !!paper.hiddenInGraph },
    });
  }
});

test("empty minimal view offers all nodes and display choices stay isolated between workspaces", async ({
  page,
  request,
}) => {
  const spaces = await (await request.get("/api/workspaces")).json();
  const demo = spaces.find((s: { demo: boolean }) => s.demo);
  const source = await (await request.get(`/api/workspaces/${demo.id}`)).json();
  const spacesData = ["visibility-a", "visibility-b"].map((id) => ({
    ...source,
    id,
    name: id,
    demo: false,
    nodes: [{ ...source.nodes[0], importance: "normal" }],
    edges: [],
    routes: [],
  }));
  await page.route("**/api/workspaces", (route) =>
    route.fulfill({ json: spacesData }),
  );
  for (const w of spacesData)
    await page.route(`**/api/workspaces/${w.id}`, (route) =>
      route.fulfill({ json: w }),
    );
  await page.goto("/");
  await page.getByRole("button", { name: "技术图谱", exact: true }).click();
  const modes = page.getByRole("group", { name: "节点显示模式", exact: true });
  await modes.getByRole("button", { name: "极简节点", exact: true }).click();
  await expect(page.locator(".graph-node")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "显示全部节点", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("切换研究空间", { exact: true })
    .selectOption("visibility-b");
  await expect(
    modes.getByRole("button", { name: "全部节点", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".graph-node")).toHaveCount(1);
  await page
    .getByLabel("切换研究空间", { exact: true })
    .selectOption("visibility-a");
  await expect(page.locator(".graph-node")).toHaveCount(0);
  await page.getByRole("button", { name: "显示全部节点", exact: true }).click();
  await expect(page.locator(".graph-node")).toHaveCount(1);
});
