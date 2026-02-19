<!-- src/lib/components/login-form.svelte -->
<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    FieldGroup,
    Field,
    FieldLabel,
  } from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { cn } from "$lib/utils.js";
  import type { HTMLAttributes } from "svelte/elements";
  import { login } from "$lib/firebase/auth";
  import { goto } from "$app/navigation";

  let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> =
    $props();

  const id = $props.id();

  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let errorMsg = $state("");

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    errorMsg = "";
    loading = true;

    try {
      await login(email, password);
      goto("/dashboard");
    } catch (err: any) {
      // Terjemahkan error Firebase ke bahasa Indonesia
      switch (err.code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
          errorMsg = "Email atau password salah.";
          break;
        case "auth/too-many-requests":
          errorMsg = "Terlalu banyak percobaan. Coba lagi beberapa saat.";
          break;
        case "auth/user-disabled":
          errorMsg = "Akun ini telah dinonaktifkan.";
          break;
        default:
          errorMsg = "Terjadi kesalahan. Silakan coba lagi.";
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class={cn("flex flex-col gap-6", className)} {...restProps}>
  <Card.Root>
    <Card.Header class="text-center">
      <Card.Title class="text-xl">Selamat Datang</Card.Title>
      <Card.Description>Masuk ke sistem ERP Zarqa</Card.Description>
    </Card.Header>
    <Card.Content>
      <form onsubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel for="email-{id}">Email</FieldLabel>
            <Input
              id="email-{id}"
              type="email"
              placeholder="admin@zarqa.com"
              bind:value={email}
              required
              disabled={loading}
            />
          </Field>

          <Field>
            <FieldLabel for="password-{id}">Password</FieldLabel>
            <Input
              id="password-{id}"
              type="password"
              placeholder="••••••••"
              bind:value={password}
              required
              disabled={loading}
            />
          </Field>

          <!-- Pesan Error -->
          {#if errorMsg}
            <p class="text-sm text-destructive text-center">{errorMsg}</p>
          {/if}

          <Field>
            <Button type="submit" disabled={loading} class="w-full">
              {#if loading}
                <span class="flex items-center gap-2">
                  <span
                    class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  ></span>
                  Masuk...
                </span>
              {:else}
                Masuk
              {/if}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </Card.Content>
  </Card.Root>
</div>
