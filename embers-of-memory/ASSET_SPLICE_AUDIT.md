# Asset Splice Audit

Generated contact sheets are in `asset-audit-contact-sheets/`.

## Summary

The splice pass did not work cleanly for many non-background assets. The exported PNG files exist, but many are partial crops from larger source sheets, contain neighboring assets, or use the wrong source region.

## Mostly Usable

- `backgrounds/` - main backgrounds are usable enough for prototype review. `screen_loading.png` and `title_background.png` should still be visually checked because they include visible transparent/checker margins in the contact sheet.
- `portraits/` - all five portraits are recognizable and likely usable, though the crops sit low with empty top padding.
- Manual assets made after slicing are structurally okay:
  - `ui/ui_skill_bar_fill_low.png`
  - `ui/ui_skill_bar_fill_mid.png`
  - `ui/ui_skill_bar_fill_high.png`
  - `ui/ui_border_simple.png`
  - `ui/badge_quality_1.png` through `ui/badge_quality_6.png`
  - `ui/ui_ideology_*.png`
  - `ui/slider_track.png`
  - `props/prop_lantern_off.png`
  - `props/tile_wall.png`

## Bad Or Suspicious Crops

### UI

- `btn_fast.png`, `btn_fast_active.png`, `btn_pause.png`, `btn_pause_active.png`, `btn_play.png`, `btn_play_active.png` are cropped out of a larger sheet and show partial neighboring UI/art around the button.
- `btn_primary_hover.png` includes a candle/flame graphic and neighboring sheet content.
- `btn_secondary_hover.png` appears cut off at the left and right edges.
- `card_scholar.png` is not a usable scholar card; it is only a partial crop of a parchment/card region.
- `ui_morale_1.png` through `ui_morale_5.png` are bad partial crops from the sheet, not clean morale indicators.
- `ui_tab_active.png` and `ui_tab_inactive.png` include chopped neighboring shapes.
- `ui_modal_1.png` through `ui_modal_5.png` exist and appear to be accidental/debug crops. They are not in the art spec.
- `ui_world_report_letter.png` is a partial page crop and needs review.

### Icons

- Many archetype, topic, format, and patron icons are shifted horizontally and include parts of neighboring icons.
- `map_icon_city.png`, `map_icon_event.png`, `map_icon_player.png`, `map_icon_rival.png`, and `map_icon_trade.png` are unusable; they are mostly feather/edge fragments rather than map icons.
- Icon order/mapping from `tier3_icons_badges_complete_sheet.png` needs manual re-mapping.

### Characters

- Named scholar animation sheets are recognizable but exported at inconsistent large dimensions:
  - idle sheets around `1024x307`
  - walk sheets around `894x177`
  - sit/react sheets around `443x177`
- These are not spec-sized sprite sheets. They need normalization to exact frame grids:
  - idle/walk: 4 frames of `32x48`
  - sit/react: 2 frames of `32x48`
- Generic scholar/student files are not valid sprite sheets; they are portrait/badge crops from the icon sheet.

### Buildings And Props

- Many buildings are cropped from sheet edges and include neighboring buildings or cut-off parts.
- Most props are oversized crops from the building/props sheet, not spec-sized small assets.
- `prop_lantern_on.png` is not a clean `16x24` asset.
- `tile_flagstone.png` and `tile_grass.png` are oversized crops containing neighboring tiles/props.
- `tile_wall.png` was manually created and is structurally okay.

### FX And Cursors

- `cursor_default.png`, `cursor_hover.png`, and `cursor_click.png` are bad partial crops.
- `fx_candle_flame.png`, `fx_gold_sparkle.png`, and `fx_work_progress.png` need frame alignment review.
- Stray root files `_morale_col0.png`, `_morale_col3.png`, `_morale_col7.png`, and `_morale_full_row.png` are debug artifacts and should not be used by the game.

## Recommended Repair Order

1. Keep backgrounds and portraits for now.
2. Replace or manually recreate runtime-critical UI first:
   - time buttons
   - morale indicators
   - scholar card
   - tabs
   - primary/secondary hover buttons
3. Re-slice icons with corrected coordinates from the source sheets.
4. Re-slice or regenerate map icons and cursors.
5. Normalize named scholar sheets into exact `32x48` frame grids.
6. Re-slice buildings and props, or regenerate smaller focused sheets for those categories.
7. Remove debug root PNGs after confirming nothing references them.
