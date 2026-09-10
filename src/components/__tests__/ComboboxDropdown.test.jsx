// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ComboboxDropdown from "../ComboboxDropdown";

const CategoryField = ({ options = ["Academic", "Administrative", "Student Life"] }) => {
  const [value, setValue] = useState("");
  return (
    <form aria-label="Acronym">
      <ComboboxDropdown
        name="category"
        aria-label="Category"
        value={value}
        onChange={setValue}
        options={options}
      />
      <button type="button" onClick={() => setValue("")}>Reset</button>
    </form>
  );
};

afterEach(cleanup);

describe("ComboboxDropdown", () => {
  it("filters suggestions and selects with arrow keys and Enter while retaining input focus", () => {
    render(<CategoryField />);
    const input = screen.getByRole("combobox", { name: "Category" });
    input.focus();
    fireEvent.change(input, { target: { value: "ad" } });
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.getElementById(input.getAttribute("aria-activedescendant")))
      .toHaveTextContent("Administrative");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Administrative");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(new FormData(screen.getByRole("form")).get("category"))
      .toBe("Administrative");
  });

  it("keeps new category text on Escape, Tab, and blur without forcing a suggestion", () => {
    render(<CategoryField />);
    const input = screen.getByRole("combobox");
    for (const key of ["Escape", "Tab"]) {
      fireEvent.change(input, { target: { value: `New category ${key}` } });
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
      fireEvent.keyDown(input, { key });
      expect(input).toHaveValue(`New category ${key}`);
      expect(input).toHaveAttribute("aria-expanded", "false");
    }
    fireEvent.change(input, { target: { value: "Campus Services" } });
    fireEvent.blur(input);
    expect(new FormData(screen.getByRole("form")).get("category"))
      .toBe("Campus Services");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects suggestions by click and respects a parent reset", () => {
    render(<CategoryField />);
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    const option = screen.getByRole("option", { name: "Student Life" });
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(input).toHaveValue("Student Life");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(input).toHaveValue("");
    fireEvent.click(input);
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("allows a first category when there are no suggestions", () => {
    render(<CategoryField options={[]} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "First category" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("First category");
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("does not expose suggestions when disabled", () => {
    render(<ComboboxDropdown disabled options={["Academic"]} onChange={vi.fn()} aria-label="Category" />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
