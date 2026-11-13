import { state } from "../core/store.js";
import { empty } from "../ui/components.js";

export default function notFoundView(main) {
  main.innerHTML = `<div class="card mt-6">${empty({ title: "Page not found", text: "That page does not exist.", ic: "alert-circle",
    action: `<a class="btn btn-primary" href="${state.session ? "/dashboard" : "/login"}" data-link>Go ${state.session ? "to the dashboard" : "to sign in"}</a>` })}</div>`;
  return { title: "Not found" };
}
