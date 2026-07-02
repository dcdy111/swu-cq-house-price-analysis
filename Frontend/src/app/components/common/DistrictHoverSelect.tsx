import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "../ui/utils";

type DistrictOption = {
  name: string;
};

interface DistrictHoverSelectProps {
  value: string | null;
  options: DistrictOption[];
  onChange: (value: string) => void;
}

function menuItemStyle(itemKey: string, selected: boolean, hoveredItem: string | null): React.CSSProperties {
  const hovered = hoveredItem === itemKey;
  const dimmed = hoveredItem !== null && !hovered;

  return {
    fontSize: 13,
    color: hovered ? "#163A70" : selected ? "#163A70" : dimmed ? "#9CA3AF" : "#374151",
    fontWeight: hovered || selected ? 600 : 400,
    background: hovered ? "#E8EDF4" : selected ? "#EFF6FF" : dimmed ? "#FAFBFC" : "transparent",
    opacity: dimmed ? 0.72 : 1,
    borderLeft: hovered ? "2px solid #163A70" : "2px solid transparent",
    transition: "background-color 160ms ease, color 160ms ease, opacity 160ms ease, border-color 160ms ease",
  };
}

export function DistrictHoverSelect({ value, options, onChange }: DistrictHoverSelectProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, []);

  const handleEnter = () => {
    clearCloseTimer();
    setHovered(true);
    setOpen(true);
  };

  const handleLeave = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setHovered(false);
      setOpen(false);
      setHoveredItem(null);
    }, 160);
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updateMenuPosition]);

  const displayValue = value ?? "未选中";
  const active = open || hovered;

  const menu = open
    ? createPortal(
        <div
          className="max-h-56 overflow-y-auto rounded-lg border bg-white py-1 shadow-2xl"
          style={{
            ...menuStyle,
            borderColor: hoveredItem ? "#CBD5E1" : "#E5EAF2",
            background: hoveredItem ? "#F8FAFC" : "#FFFFFF",
            transition: "border-color 160ms ease, background-color 160ms ease",
            animation: "districtMenuIn 160ms ease-out",
          }}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <button
            type="button"
            className="mx-1 flex w-[calc(100%-8px)] items-center rounded-md px-3 py-2 text-left"
            style={menuItemStyle("__none__", value === null, hoveredItem)}
            onMouseEnter={() => setHoveredItem("__none__")}
            onMouseLeave={() => setHoveredItem(null)}
            onClick={() => {
              onChange("__none__");
              setOpen(false);
              setHovered(false);
              setHoveredItem(null);
            }}
          >
            未选中
          </button>
          {options.map(district => {
            const selected = value === district.name;
            return (
              <button
                key={district.name}
                type="button"
                className="mx-1 flex w-[calc(100%-8px)] items-center rounded-md px-3 py-2 text-left"
                style={menuItemStyle(district.name, selected, hoveredItem)}
                onMouseEnter={() => setHoveredItem(district.name)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={() => {
                  onChange(district.name);
                  setOpen(false);
                  setHovered(false);
                  setHoveredItem(null);
                }}
              >
                {district.name}
              </button>
            );
          })}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <div
        ref={triggerRef}
        className={cn("relative transition-all duration-200", open && "z-50")}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <div
          className="cursor-pointer select-none rounded-lg px-3 py-3 transition-all duration-200"
          style={{
            background: active ? "#E8EDF4" : "#F8FAFC",
            border: `1px solid ${active ? "#CBD5E1" : "#E5EAF2"}`,
            boxShadow: open ? "0 10px 28px rgba(15, 23, 42, 0.12)" : "none",
          }}
        >
          <div style={{ fontSize: 11, color: "#6B7280" }}>选中区县</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span style={{ fontSize: 14, color: "#1F2937", fontWeight: 600 }}>{displayValue}</span>
            <ChevronDown
              size={14}
              className="shrink-0 transition-transform duration-200"
              style={{
                color: "#9CA3AF",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </div>
        </div>
      </div>
      {menu}
      <style>{`
        @keyframes districtMenuIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
