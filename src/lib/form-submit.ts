import { startTransition, type FormEvent } from "react";

// Envia um formulário para a action do useActionState SEM o reset automático do React 19.
// Com <form action={action}>, o React limpa os campos depois de cada envio, e um erro de validação
// apagaria o que a pessoa digitou. Uso: <form onSubmit={submitKeepingValues(action)}>.
// O botão clicado (submitter) entra no FormData, como num envio normal (ex.: name="status" value="...").
export function submitKeepingValues(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => action(data));
  };
}
