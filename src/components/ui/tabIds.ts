/** Shared id scheme so a Tabs tablist and its panels can reference each other (aria-controls / aria-labelledby). */
export function tabPanelProps(prefix: string, id: string) {
  return { role: "tabpanel", id: `${prefix}-panel-${id}`, "aria-labelledby": `${prefix}-tab-${id}` } as const;
}
