import { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";

interface PersonOption {
  id: string;
  label: string;
}

interface PersonPickerProps {
  value: string;
  onChange: (id: string) => void;
  options: PersonOption[];
  placeholder?: string;
  required?: boolean;
  emptyLabel?: string;
}

export function PersonPicker({
  value,
  onChange,
  options,
  placeholder = "Hledat...",
  required,
  emptyLabel,
}: PersonPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.id === value);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full h-10 px-3 rounded-input border border-input bg-background text-foreground font-body text-sm flex items-center cursor-pointer hover:border-ring transition-colors"
      >
        {open ? (
          <div className="flex items-center gap-2 w-full">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="bg-transparent outline-none w-full font-body text-sm text-foreground placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setSearch("");
                }
              }}
            />
          </div>
        ) : (
          <span className={selectedOption ? "text-foreground" : "text-muted-foreground"}>
            {selectedOption?.label || placeholder}
          </span>
        )}
      </div>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
          style={{ maxHeight: 220, overflowY: "auto" }}
        >
          {emptyLabel && (
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={`w-full text-left px-3 py-2 text-sm font-body hover:bg-accent transition-colors ${
                !value ? "bg-accent/50 font-medium" : ""
              }`}
            >
              <span className="text-muted-foreground">{emptyLabel}</span>
            </button>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground font-body text-center">
              Žádné výsledky
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => handleSelect(o.id)}
                className={`w-full text-left px-3 py-2 text-sm font-body hover:bg-accent transition-colors ${
                  o.id === value ? "bg-accent/50 font-medium" : ""
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}

      {/* Hidden input for form validation */}
      {required && (
        <input
          type="text"
          value={value}
          required
          onChange={() => {}}
          tabIndex={-1}
          className="absolute opacity-0 h-0 w-0 pointer-events-none"
        />
      )}
    </div>
  );
}
