import { asyncEvalInContext, DataviewInlineApi } from "api/inline-api";
import { renderErrorPre, renderValue } from "ui/render";
import { DataviewRefreshableRenderer } from "ui/refreshable-view";
import { DataviewApi } from "api/plugin-api";
export class DataviewJSRenderer extends DataviewRefreshableRenderer {
    static PREAMBLE: string = "const dataview = this;const dv = this;";

    constructor(public api: DataviewApi, public script: string, public container: HTMLElement, public origin: string) {
        super(container, api.index, api.app, api.settings);
    }

    async render() {
        // Ensure the outer container is a simple grid so layers overlap.
        this.container.classList.add("dv-grid-parent");
        Object.assign(this.container.style, {
            display: "grid",
            gridTemplateColumns: "1fr",
            gridTemplateRows: "auto",
            justifyItems: "stretch",
            alignItems: "start",
            position: "relative",
        });


        const layer = document.createElement("div");
        layer.className = "dv-layer";
        Object.assign(layer.style, {
            gridRow: "1",
            gridColumn: "1",
            zIndex: "2",
            justifySelf: "stretch",
            alignSelf: "start",
            width: "100%",
            opacity: "0",
            transition: "opacity 0.2s ease-out",
        });

        if (!this.settings.enableDataviewJs) {
            renderErrorPre(
                layer,
                "Dataview JS queries are disabled. You can enable them in the Dataview settings."
            );
        } else {
            // Assume that the code is javascript, and try to eval it.
            try {
                await asyncEvalInContext(
                    DataviewJSRenderer.PREAMBLE + this.script,
                    new DataviewInlineApi(this.api, this, layer, this.origin)
                );
            } catch (e) {
                renderErrorPre(layer, "Evaluation Error: " + e.stack);
            }
        }

        // Append new overlay layer on top
        this.container.appendChild(layer);

        // Fade-in the newly added layer
        requestAnimationFrame(() => {
            layer.style.opacity = "1";
        });

        // Fade out and remove any previous layers
        const oldLayers = Array.from(this.container.querySelectorAll('.dv-layer')).filter(el => el !== layer);
        oldLayers.forEach((_old) => {
            const old = _old as HTMLElement;
            // Lower stacking order and fade out
            old.style.zIndex = "1";
            const currentTransition = old.style.transition || "";
            old.style.transition = currentTransition
                ? currentTransition + ", opacity 0.5s ease-out"
                : "opacity 0.5s ease-out";
            old.style.opacity = "0";
            old.addEventListener('transitionend', () => {
                old.remove();
            }, { once: true });
            // Fallback removal in case transitionend doesn't fire
            setTimeout(() => {
                if (old.parentElement) old.remove();
            }, 500);
        });
    }
}

/** Inline JS renderer accessible using '=$' by default. */
export class DataviewInlineJSRenderer extends DataviewRefreshableRenderer {
    static PREAMBLE: string = "const dataview = this;const dv=this;";

    // The box that the error is rendered in, if relevant.
    errorbox?: HTMLElement;

    constructor(
        public api: DataviewApi,
        public script: string,
        public container: HTMLElement,
        public target: HTMLElement,
        public origin: string
    ) {
        super(container, api.index, api.app, api.settings);
    }

    async render() {
        this.errorbox?.remove();
        if (!this.settings.enableDataviewJs || !this.settings.enableInlineDataviewJs) {
            let temp = document.createElement("span");
            temp.innerText = "(disabled; enable in settings)";
            this.target.replaceWith(temp);
            this.target = temp;
            return;
        }

        // Assume that the code is javascript, and try to eval it.
        try {
            let temp = document.createElement("span");
            let result = await asyncEvalInContext(
                DataviewInlineJSRenderer.PREAMBLE + this.script,
                new DataviewInlineApi(this.api, this, temp, this.origin)
            );
            this.target.replaceWith(temp);
            this.target = temp;
            if (result === undefined) return;

            renderValue(this.api.app, result, temp, this.origin, this, this.settings, false);
        } catch (e) {
            this.errorbox = this.container.createEl("div");
            renderErrorPre(this.errorbox, "Dataview (for inline JS query '" + this.script + "'): " + e);
        }
    }
}
