import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Quote, Target, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarLayout } from "@/components/layout/sidebar-layout";

type DetailLevel = "summary" | "standard" | "full";
type CitationStyle = "section" | "inline";

const detailOptions: { value: DetailLevel; title: string; description: string }[] = [
  {
    value: "summary",
    title: "Quick summary",
    description: "One tight paragraph with citations for rapid readouts.",
  },
  {
    value: "standard",
    title: "Standard detail",
    description: "Balanced narrative with actions and short rationale.",
  },
  {
    value: "full",
    title: "Full technical checklist",
    description: "Every numbered step preserved for procedural use.",
  },
];

const citationOptions: { value: CitationStyle; title: string; description: string }[] = [
  {
    value: "section",
    title: "Grouped citations",
    description: "Keep references together in the citations section.",
  },
  {
    value: "inline",
    title: "Inline after steps",
    description: "Append paragraph IDs right after the referenced step.",
  },
];

export default function Configure() {
  const { toast } = useToast();

  const [audienceFocus, setAudienceFocus] = useState("");
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("standard");
  const [requiresChecklist, setRequiresChecklist] = useState<boolean>(true);
  const [mustHaveInput, setMustHaveInput] = useState("");
  const [pinnedItems, setPinnedItems] = useState<string[]>([]);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>("section");
  const [helperMessage, setHelperMessage] = useState<string>("");

  const preview = useMemo(
    () => ({
      audience: audienceFocus || "Default: maintenance leadership",
      detail: detailOptions.find((option) => option.value === detailLevel)?.title ?? "Standard detail",
      checklist: requiresChecklist ? "Procedural mode on" : "Condensed action highlights",
      citations: citationOptions.find((option) => option.value === citationStyle)?.title ?? "Grouped citations",
      pinnedItems,
    }),
    [audienceFocus, detailLevel, requiresChecklist, citationStyle, pinnedItems]
  );

  const addPinnedItems = (input: string) => {
    const items = input
      .split(/\n|,|;/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!items.length) {
      setHelperMessage("No new items detected.");
      return;
    }

    setPinnedItems((prev) => {
      const merged = new Set(prev);
      items.forEach((item) => merged.add(item));
      return Array.from(merged);
    });
    setMustHaveInput("");
    setHelperMessage(`${items.length} item${items.length > 1 ? "s" : ""} added.`);
  };

  const removePinnedItem = (value: string) => {
    setPinnedItems((prev) => prev.filter((item) => item !== value));
  };

  const handleApply = () => {
    toast({
      title: "Preferences saved",
      description: "We will tailor future answers using these selections.",
    });
  };

  const handleReset = () => {
    setAudienceFocus("");
    setDetailLevel("standard");
    setRequiresChecklist(true);
    setMustHaveInput("");
    setPinnedItems([]);
    setCitationStyle("section");
    setHelperMessage("");
  };

  return (
    <SidebarLayout title="Configure Output">
      <div className="mx-auto max-w-6xl space-y-6">
        <p className="text-sm text-muted-foreground">Capture mission-focused preferences. No YAML edits.</p>

        <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Audience &amp; mission focus</CardTitle>
              <CardDescription>Who you support and what should stand out.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Target className="mt-1 h-5 w-5 text-foreground/70" aria-hidden />
                  <Textarea
                    value={audienceFocus}
                    onChange={(event) => setAudienceFocus(event.target.value)}
                    placeholder="e.g., Flightline expediters who need rapid go/no-go criteria"
                    className="min-h-[96px]"
                  />
                </div>
                <div className="min-h-[20px] text-xs text-muted-foreground">
                  Describe the team and their primary need.
                </div>
              </div>

            </CardContent>
          </Card>

          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Depth &amp; tone</CardTitle>
              <CardDescription>Choose how extensive responses should be.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-6 md:grid-cols-2">
              {detailOptions.map((option) => (
                <SelectionCard
                  key={option.value}
                  checked={detailLevel === option.value}
                  onClick={() => setDetailLevel(option.value)}
                  title={option.title}
                  description={option.description}
                  icon={BookOpen}
                />
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Procedural checklist</CardTitle>
              <CardDescription>Decide if every numbered step is required.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between rounded-2xl border p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-5 w-5 text-foreground/70" aria-hidden />
                    <p className="font-medium">Include exhaustive steps</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Keeps procedural mode enabled for maintainer workflows.
                  </p>
                </div>
                <Switch checked={requiresChecklist} onCheckedChange={setRequiresChecklist} aria-label="Toggle exhaustive steps" />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Must-call-out items</CardTitle>
              <CardDescription>List warnings, supplements, or AFIs to always surface.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <ChipInput
                value={mustHaveInput}
                setValue={(value) => {
                  setMustHaveInput(value);
                  setHelperMessage("");
                }}
                chips={pinnedItems}
                onAdd={addPinnedItems}
                onRemove={removePinnedItem}
              />
              <div className="min-h-[20px] text-xs text-muted-foreground">{helperMessage}</div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Citation styling</CardTitle>
              <CardDescription>Control where paragraph IDs appear.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-6 md:grid-cols-2">
              {citationOptions.map((option) => (
                <SelectionCard
                  key={option.value}
                  checked={citationStyle === option.value}
                  onClick={() => setCitationStyle(option.value)}
                  title={option.title}
                  description={option.description}
                  icon={Quote}
                />
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 lg:col-span-1">
          <Card className="sticky top-24 rounded-2xl border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Preview of overrides</CardTitle>
              <CardDescription>How the assistant will respond.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-6 text-sm">
              <PreviewRow label="Audience" value={preview.audience} />
              <PreviewRow label="Detail" value={preview.detail} />
              <PreviewRow label="Procedural" value={preview.checklist} />
              <PreviewRow label="Citations" value={preview.citations} />
              <div className="pt-2">
                <Badge variant="secondary" className="mb-2">Pinned highlights</Badge>
                {preview.pinnedItems.length ? (
                  <ul className="ml-4 list-disc space-y-1">
                    {preview.pinnedItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">No mandatory call-outs yet.</p>
                )}
              </div>
            </CardContent>
            <div className="flex items-center justify-end gap-2 border-t p-6">
              <Button type="button" variant="outline" onClick={handleReset}>
                Reset
              </Button>
              <Button type="button" onClick={handleApply}>
                Save preferences
              </Button>
            </div>
          </Card>
        </aside>
      </div>
      </div>
    </SidebarLayout>
  );
}

function SelectionCard({
  checked,
  onClick,
  title,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  icon?: typeof BookOpen;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border p-4 transition",
        "hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40",
        checked ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"
      )}
      aria-pressed={checked}
    >
      <div className="flex items-start gap-3">
        {Icon ? <Icon className={cn("h-5 w-5", checked ? "text-primary" : "text-foreground/70")} aria-hidden /> : null}
        <div className="space-y-1">
          <div className="font-medium">{title}</div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
    </button>
  );
}

function ChipInput({
  value,
  setValue,
  onAdd,
  chips,
  onRemove,
}: {
  value: string;
  setValue: (value: string) => void;
  onAdd: (value: string) => void;
  chips: string[];
  onRemove: (value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 min-h-[34px]">
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium"
          >
            {chip}
            <button
              type="button"
              onClick={() => onRemove(chip)}
              className="text-muted-foreground transition hover:text-destructive"
              aria-label={`Remove ${chip}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Add items separated by commas or new lines"
          className="min-h-[96px]"
        />
        <Button
          type="button"
          onClick={() => onAdd(value)}
          className="md:self-start"
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Badge variant="secondary" className="mt-0.5 w-fit min-w-[84px] justify-center">
        {label}
      </Badge>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}
