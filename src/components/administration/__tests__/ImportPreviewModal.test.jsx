// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ImportPreviewModal from "../ImportPreviewModal";
import { ImportTransaction } from "../../../utils/import/transaction-model";

const loadPeopleMock = vi.fn();

vi.mock("../../../contexts/PeopleContext", () => ({
  usePeople: () => ({
    people: [],
    loadPeople: loadPeopleMock,
  }),
}));

const createModifyTransaction = () => {
  const transaction = new ImportTransaction("directory", "Directory import preview", "Fall 2026");
  const changeId = transaction.addChange(
    "people",
    "modify",
    {
      email: "jane.new@example.edu",
      phone: "2542220000",
    },
    {
      id: "person-1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane.old@example.edu",
      phone: "2541110000",
    },
  );
  const change = transaction.changes.people.modified[0];
  change.diff = [
    { key: "email", from: "jane.old@example.edu", to: "jane.new@example.edu" },
    { key: "phone", from: "2541110000", to: "2542220000" },
  ];
  return { transaction, changeId };
};

const createTwoChangeTransaction = () => {
  const first = createModifyTransaction();
  const secondChangeId = first.transaction.addChange(
    "people",
    "modify",
    { phone: "2543330000" },
    {
      id: "person-2",
      firstName: "Jamie",
      lastName: "Smith",
      phone: "2541110000",
    },
  );
  const change = first.transaction.changes.people.modified.find(
    (entry) => entry.id === secondChangeId,
  );
  change.diff = [{ key: "phone", from: "2541110000", to: "2543330000" }];
  return first.transaction;
};

const openFieldDetails = async () => {
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /apply selected changes/i })).toBeEnabled();
  });
  const unnamedButtons = screen.getAllByRole("button", { name: "" });
  fireEvent.click(unnamedButtons[1]);
};

describe("ImportPreviewModal field selection", () => {
  afterEach(() => {
    cleanup();
    loadPeopleMock.mockReset();
  });

  it("keeps default-selected fields selected when one field is unchecked", async () => {
    const { transaction, changeId } = createModifyTransaction();
    const onCommit = vi.fn();

    render(
      <ImportPreviewModal
        transaction={transaction}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onCommit={onCommit}
      />,
    );

    await openFieldDetails();

    fireEvent.click(screen.getByLabelText(/Email/i));
    fireEvent.click(screen.getByRole("button", { name: /apply selected changes/i }));

    expect(onCommit).toHaveBeenCalledWith(
      transaction.id,
      null,
      { [changeId]: ["phone"] },
      {},
    );
  });

  it("sends an empty field list when all visible fields are unchecked", async () => {
    const { transaction, changeId } = createModifyTransaction();
    const onCommit = vi.fn();

    render(
      <ImportPreviewModal
        transaction={transaction}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onCommit={onCommit}
      />,
    );

    await openFieldDetails();

    fireEvent.click(screen.getByLabelText(/Select all fields/i));
    fireEvent.click(screen.getByRole("button", { name: /apply selected changes/i }));

    expect(onCommit).toHaveBeenCalledWith(
      transaction.id,
      null,
      { [changeId]: [] },
      {},
    );
  });

  it("resets selected change state when a new transaction is loaded", async () => {
    const first = createModifyTransaction();
    const second = createTwoChangeTransaction();

    const { rerender } = render(
      <ImportPreviewModal
        transaction={first.transaction}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply selected changes \(1/i })).toBeEnabled();
    });

    rerender(
      <ImportPreviewModal
        transaction={second}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /apply selected changes \(2/i })).toBeEnabled();
    });
  });
});
