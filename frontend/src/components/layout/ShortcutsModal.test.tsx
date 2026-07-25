import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ShortcutsModal } from "./ShortcutsModal";

describe("ShortcutsModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <ShortcutsModal open={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the panel and its sections when open is true", () => {
    render(<ShortcutsModal open onClose={vi.fn()} />);
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("In-page")).toBeInTheDocument();
  });

  it("renders the Ctrl+Shift+Space global shortcut row", () => {
    render(<ShortcutsModal open onClose={vi.fn()} />);
    expect(
      screen.getByText("Summon window from anywhere")
    ).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsModal open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close shortcuts panel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<ShortcutsModal open onClose={onClose} />);
    // The first div rendered is the dialog wrapper; the backdrop is the
    // absolutely-positioned sibling of the panel.
    const backdrop = document.querySelector("[aria-hidden='true']") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<ShortcutsModal open onClose={onClose} />);
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on non-Escape key", () => {
    const onClose = vi.fn();
    render(<ShortcutsModal open onClose={onClose} />);
    act(() => {
      fireEvent.keyDown(document, { key: "Enter" });
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
