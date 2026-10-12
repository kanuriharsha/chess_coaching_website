import { useEffect, useState } from 'react';
import { Loader2, Puzzle, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface GrantableCategory {
  category: string;
  name?: string;
  icon?: string;
  total: number;
}

interface PuzzleGrantSettings {
  enabled: boolean;
  limit: number;
  rangeStart: number | null;
  rangeEnd: number | null;
  specificPuzzles: number[];
}

interface AdminPuzzleAccessResponse {
  categories: GrantableCategory[];
  puzzleAccess: Record<string, PuzzleGrantSettings>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface AdminPuzzleAccessDialogProps {
  adminId: string | null;
  adminUsername: string;
  token: string | null;
  onOpenChange: (open: boolean) => void;
}

const createDefaultSettings = (): PuzzleGrantSettings => ({
  enabled: false,
  limit: 0,
  rangeStart: null,
  rangeEnd: null,
  specificPuzzles: []
});

export default function AdminPuzzleAccessDialog({
  adminId,
  adminUsername,
  token,
  onOpenChange
}: AdminPuzzleAccessDialogProps) {
  const [categories, setCategories] = useState<GrantableCategory[]>([]);
  const [puzzleAccess, setPuzzleAccess] = useState<Record<string, PuzzleGrantSettings>>({});
  const [specificPuzzlesInputs, setSpecificPuzzlesInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const open = Boolean(adminId);

  useEffect(() => {
    if (!open || !adminId || !token) return;

    let cancelled = false;
    const loadAccess = async () => {
      setIsLoading(true);
      setLoadError(null);
      setCategories([]);
      setPuzzleAccess({});
      setSpecificPuzzlesInputs({});
      try {
        const response = await fetch(`${API_BASE_URL}/superadmin/admins/${adminId}/puzzle-access`, {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(`${error.message || 'Failed to load puzzle access'} (HTTP ${response.status})`);
        }
        const data: unknown = await response.json();
        if (!isRecord(data) || !Array.isArray(data.categories) || !isRecord(data.puzzleAccess)) {
          const responseFields = isRecord(data) ? Object.keys(data).join(', ') : typeof data;
          throw new Error(
            `The puzzle-access API returned an unexpected response (${responseFields}). ` +
            'Restart the backend server and try again.'
          );
        }

        const parsedCategories: GrantableCategory[] = [];
        for (const rawCategory of data.categories) {
          if (
            !isRecord(rawCategory) ||
            typeof rawCategory.category !== 'string' ||
            !Number.isSafeInteger(rawCategory.total) ||
            Number(rawCategory.total) < 0
          ) {
            throw new Error('The puzzle-access API returned invalid category data.');
          }
          parsedCategories.push({
            category: rawCategory.category,
            total: Number(rawCategory.total),
            name: typeof rawCategory.name === 'string' ? rawCategory.name : undefined,
            icon: typeof rawCategory.icon === 'string' ? rawCategory.icon : undefined
          });
        }

        if (!cancelled) {
          setCategories(parsedCategories);
          const normalizedAccess: Record<string, PuzzleGrantSettings> = {};
          const specificInputs: Record<string, string> = {};
          parsedCategories.forEach(({ category }) => {
            const rawSettings = data.puzzleAccess[category];
            if (rawSettings !== undefined && (
              !isRecord(rawSettings) ||
              typeof rawSettings.enabled !== 'boolean' ||
              !Number.isSafeInteger(rawSettings.limit) ||
              Number(rawSettings.limit) < 0 ||
              (rawSettings.rangeStart !== null && !Number.isSafeInteger(rawSettings.rangeStart)) ||
              (rawSettings.rangeEnd !== null && !Number.isSafeInteger(rawSettings.rangeEnd)) ||
              !Array.isArray(rawSettings.specificPuzzles) ||
              rawSettings.specificPuzzles.some(number => !Number.isSafeInteger(number))
            )) {
              throw new Error(`The puzzle-access API returned invalid settings for ${category}.`);
            }
            const settings: PuzzleGrantSettings = rawSettings
              ? {
                  enabled: Boolean(rawSettings.enabled),
                  limit: Number(rawSettings.limit),
                  rangeStart: Number(rawSettings.rangeStart),
                  rangeEnd: Number(rawSettings.rangeEnd),
                  specificPuzzles: rawSettings.specificPuzzles.map(Number)
                }
              : createDefaultSettings();
            if (rawSettings?.rangeStart === null) settings.rangeStart = null;
            if (rawSettings?.rangeEnd === null) settings.rangeEnd = null;
            normalizedAccess[category] = settings;
            specificInputs[category] = settings.specificPuzzles.join(', ');
          });
          setPuzzleAccess(normalizedAccess);
          setSpecificPuzzlesInputs(specificInputs);
        }
      } catch (error) {
        console.error('Load admin puzzle access error:', error);
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Failed to load puzzle access';
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadAccess();
    return () => {
      cancelled = true;
    };
  }, [adminId, open, token]);

  const updatePuzzleAccess = (
    category: string,
    field: keyof PuzzleGrantSettings,
    value: boolean | number | number[] | null
  ) => {
    setPuzzleAccess(current => ({
      ...current,
      [category]: {
        ...(current[category] || createDefaultSettings()),
        [field]: value
      }
    }));
  };

  const saveAccess = async () => {
    if (!adminId || !token) return;

    const submittedAccess: Record<string, PuzzleGrantSettings> = {};
    for (const { category, total } of categories) {
      const settings = puzzleAccess[category] || createDefaultSettings();
      const rawSpecificNumbers = specificPuzzlesInputs[category] || '';
      const specificPuzzles = rawSpecificNumbers.trim()
        ? rawSpecificNumbers.split(',').map(value => Number(value.trim()))
        : [];
      const hasRangeStart = settings.rangeStart !== null;
      const hasRangeEnd = settings.rangeEnd !== null;

      if (
        !Number.isSafeInteger(settings.limit) ||
        settings.limit < 0 ||
        (hasRangeStart !== hasRangeEnd) ||
        (hasRangeStart && (
          !Number.isSafeInteger(settings.rangeStart) ||
          !Number.isSafeInteger(settings.rangeEnd) ||
          settings.rangeStart! < 1 ||
          settings.rangeEnd! < settings.rangeStart! ||
          settings.rangeEnd! > total
        )) ||
        specificPuzzles.some(number =>
          !Number.isSafeInteger(number) || number < 1 || number > total
        )
      ) {
        toast.error(`Check the limit, range, and puzzle numbers for ${category}`);
        return;
      }

      submittedAccess[category] = {
        ...settings,
        specificPuzzles: [...new Set(specificPuzzles)]
      };
    }

    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/superadmin/admins/${adminId}/puzzle-access`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ puzzleAccess: submittedAccess })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to save puzzle access');
      }
      setPuzzleAccess(submittedAccess);
      setSpecificPuzzlesInputs(Object.fromEntries(
        Object.entries(submittedAccess).map(([category, settings]) => [
          category,
          settings.specificPuzzles.join(', ')
        ])
      ));
      toast.success(`Puzzle access updated for ${adminUsername}`);
      onOpenChange(false);
    } catch (error) {
      console.error('Save admin puzzle access error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save puzzle access');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedPuzzleCount = categories.reduce((sum, { category, total }) => {
    const settings = puzzleAccess[category];
    if (!settings?.enabled) return sum;
    const hasRange = settings.rangeStart != null && settings.rangeEnd != null;
    const hasSpecific = settings.specificPuzzles.length > 0;
    if (hasRange || hasSpecific) {
      const rangeCount = hasRange
        ? Math.max(0, Math.min(settings.rangeEnd!, total) - Math.max(settings.rangeStart!, 1) + 1)
        : 0;
      return sum + new Set([
        ...Array.from({ length: rangeCount }, (_, index) => index + Math.max(settings.rangeStart!, 1)),
        ...settings.specificPuzzles
      ]).size;
    }
    return sum + (settings.limit > 0 ? Math.min(settings.limit, total) : total);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Puzzle Access for {adminUsername}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Grant puzzle ranges to this admin. They can assign granted puzzles to their students, but cannot edit the puzzles.
        </DialogDescription>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : loadError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {loadError}
          </p>
        ) : categories.length === 0 ? (
          <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
            There are no enabled puzzles created by this superadmin to grant.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {categories.map(({ category, name, icon, total }) => {
              const settings = puzzleAccess[category] || createDefaultSettings();
              const isEnabled = settings.enabled;
              return (
                <div
                  key={category}
                  className={`rounded-lg p-4 transition-colors ${
                    isEnabled ? 'border-2 border-primary/40 bg-primary/5' : 'border border-border bg-secondary/40'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {icon ? (
                        <span className="shrink-0" aria-hidden="true">{icon}</span>
                      ) : (
                        <Puzzle className="h-4 w-4 shrink-0 text-primary" />
                      )}
                      <span className="truncate font-medium">{name || category}</span>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={checked => updatePuzzleAccess(category, 'enabled', checked)}
                      aria-label={`Grant ${category} puzzles`}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="shrink-0 text-sm text-muted-foreground">Puzzle Limit:</Label>
                      <Input
                        type="number"
                        min="0"
                        max={total}
                        value={settings.limit || 0}
                        onChange={event => updatePuzzleAccess(category, 'limit', Math.max(0, parseInt(event.target.value, 10) || 0))}
                        className="h-8 w-20"
                        disabled={!isEnabled}
                      />
                      <span className="text-sm text-muted-foreground">/ {total} available</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="shrink-0 text-sm text-muted-foreground">Range:</Label>
                      <Input
                        type="number"
                        min="1"
                        max={total}
                        placeholder="Start"
                        value={settings.rangeStart ?? ''}
                        onChange={event => updatePuzzleAccess(category, 'rangeStart', event.target.value ? parseInt(event.target.value, 10) : null)}
                        className="h-8 w-20"
                        disabled={!isEnabled}
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="number"
                        min="1"
                        max={total}
                        placeholder="End"
                        value={settings.rangeEnd ?? ''}
                        onChange={event => updatePuzzleAccess(category, 'rangeEnd', event.target.value ? parseInt(event.target.value, 10) : null)}
                        className="h-8 w-20"
                        disabled={!isEnabled}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">Specific #s:</Label>
                      <Input
                        type="text"
                        placeholder="e.g. 11, 12, 16"
                        value={specificPuzzlesInputs[category] ?? settings.specificPuzzles.join(', ')}
                        onChange={event => setSpecificPuzzlesInputs(current => ({
                          ...current,
                          [category]: event.target.value
                        }))}
                        onBlur={event => {
                          const values = event.target.value
                            .split(',')
                            .map(value => value.trim())
                            .filter(Boolean)
                            .map(value => Number(value));
                          if (values.some(value => !Number.isSafeInteger(value) || value < 1 || value > total)) {
                            toast.error(`Puzzle numbers for ${category} must be between 1 and ${total}`);
                            return;
                          }
                          const uniqueValues = [...new Set(values)];
                          updatePuzzleAccess(category, 'specificPuzzles', uniqueValues);
                          setSpecificPuzzlesInputs(current => ({
                            ...current,
                            [category]: uniqueValues.join(', ')
                          }));
                        }}
                        className="h-8 flex-1"
                        disabled={!isEnabled}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {isEnabled
                        ? 'Range and specific numbers are combined. With neither set, the limit applies (0 means all).'
                        : 'Category not granted'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && !loadError && categories.length > 0 && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedPuzzleCount} puzzle{selectedPuzzleCount === 1 ? '' : 's'} granted
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={saveAccess} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Access
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
