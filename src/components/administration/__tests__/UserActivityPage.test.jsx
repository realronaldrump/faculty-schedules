// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocsMock = vi.fn();
const httpsCallableMock = vi.fn();

vi.mock("../../../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({ isActivityOwner: true }),
}));

vi.mock("../../../firebase", () => ({
  db: {},
  functions: {},
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (...args) => httpsCallableMock(...args),
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
      .mockResolvedValueOnce(makeSnapshot([]));

    render(<UserActivityPage />);

    await waitFor(() => {
      expect(getDocsMock).toHaveBeenCalledTimes(6);
    });
  });
});
