export const THEME = {
    panelBg: "#1f2937dd",
    panelStroke: "#2f3a4a",
    text: "#ffffff",
    subText: "#d1d5db",
    sliderBar: "#374151",
    sliderFill: "#7ac6af",
    sliderThumb: "#e5e7eb",
    mint: "#7ac6af",
    grayBtn: "#3a3f47",
    grayBtnTxt: "#e5e7eb",
    danger: "#cf4d4d",
    valueBoxBg: "#111827",
    valueBoxTx: "#e5e7eb",
    radioFill: "#7ac6af",
};

export const BUTTON_PRESETS = {
    primary: {
        background: THEME.mint,
        color: "#0b1a14",
    },
    danger: {
        background: THEME.danger,
        color: "#ffffff",
    },
    neutral: {
        background: THEME.grayBtn,
        color: THEME.grayBtnTxt,
    },
};

export function applyButtonPreset(button, presetKey) {
    const preset = BUTTON_PRESETS[presetKey];
    if (!preset) return;
    button.background = preset.background;
    button.color = preset.color;
}
