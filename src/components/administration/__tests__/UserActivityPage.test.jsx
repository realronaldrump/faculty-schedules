// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocsMock = vi.fn();

vi.mock("../../../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({ isActivityOwner: true }),
}));

vi.mock("../../../firebase", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((...args) => ({ type: "collection", args })),
  getDocs: (...args) => getDocsMock(...args),
  limit: vi.fn((value) => ({ type: "limit", value })),
  orderBy: vi.fn((field, direction) => ({ type: "orderBy", field, direction })),
  query: vi.fn((...args) => ({ type: "query", args })),
  startAfter: vi.fn((value) => ({ type: "startAfter", value })),
  where: vi.fn((field, operator, value) => ({
    type: "where",
    field,
    operator,
    value,
  })),
}));

import UserActivityPage from "../UserActivityPage";

describe("UserActivityPage", () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    getDocsMock.mockResolvedValue({ docs: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders empty states when no analytics rollups exist yet", async () => {
    render(<UserActivityPage />);

    await waitFor(() => {
      expect(getDocsMock).toHaveBeenCalled();
    });

    expect(
      screen.getByText(/No rolled-up user summaries exist yet for the selected range\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No active presence records yet\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No timeline entries yet\./i),
    ).toBeInTheDocument();
  });

  it("flags missing rollups and disables export until summaries load", async () => {
    render(<UserActivityPage />);

    await waitFor(() => {
      expect(getDocsMock).toHaveBeenCalled();
    });

    expect(screen.getByText(/Rollups not built yet/i)).toBeInTheDocument();

    const exportButton = await screen.findByRole("button", {
      name: /export csv/i,
    });
    expect(exportButton).toBeDisabled();
  });

  it("continues fetching paged summary rollups until the last page", async () => {
    const makeSnapshot = (docs) => ({
      empty: docs.length === 0,
      size: docs.length,
      docs: docs.map((doc) => ({
        id: doc.id,
        data: () => doc.data,
      })),
    });

    const pageDocs = Array.from({ length: 500 }, (_, index) => ({
      id: `page-${index}`,
      data: { dateKey: "2026-03-10", pageId: `page-${index}` },
    }));

    getDocsMock
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot(pageDocs))
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot([]))
      .mockResolvedValueOnce(makeSnapshot([]));

    render(<UserActivityPage />);

    // Analytics (1) + paged page rollups (2) + user (1) + presence (1) +
    // events (1) + tutorial progress (1) = 7 reads.
    await waitFor(() => {
      expect(getDocsMock).toHaveBeenCalledTimes(7);
    });
  });
});
