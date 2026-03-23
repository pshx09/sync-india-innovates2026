/**
 * Sanitizes a string for use as a safe key.
 * Removes or replaces characters: . $ # [ ] /
 */
export const sanitizeKey = (key) => {
    if (!key) return "General";
    return key.replace(/[\/\.#\$\[\]]/g, "_");
};
