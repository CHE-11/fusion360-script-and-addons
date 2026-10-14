# Fusion Scripts and Add-Ins

Scripts for [Autodesk Fusion](https://www.autodesk.com/products/fusion-360/overview). Each script lives in its own folder under `scripts/` and is meant to be added from Fusion’s Scripts and Add-Ins dialog.

## Install

1. In Fusion, open **Utilities → Scripts and Add-Ins** (or press `Shift+S`).
2. On the **Scripts** tab, click the **+** next to **My Scripts**.
3. Select the folder for the script you want (`scripts/Step-File-Body-Combiner` or `scripts/Renamer`).
4. Select the script in the list and click **Run**.

The script stays in that list. Run it again from the same dialog whenever you need it.

---

## Step File Body Combiner

Copies every solid and surface body in the active design into the root component, then removes the original subcomponents. Bodies keep their current positions and stay separate solids, but they belong to one component, so they move together when the design is inserted into another assembly.

Use this after importing a STEP file when the imported assembly should behave as a single rigid part.

**Folder:** `scripts/Step-File-Body-Combiner`

---

## Renamer

Renames the selected bodies and sketches to `base_1`, `base_2`, and so on, in selection order. It is common to have a lot of bodies you need to reference later, but name doesn't matter other than a quick reference. For me, this is often things like letters in a 3d print where I need to select many bodies in the 3d slicer to change color. 

**Folder:** `scripts/Renamer`

---

## Better Parameters

Opens a window for editing parameters on the selected object, or on every object in the design, and copies a parameter name to the clipboard. It is an add-in, so add `addons/ce-parameters` from the **Add-Ins** tab instead of the Scripts tab. There is no build step.

**Folder:** `addons/ce-parameters`

