import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input, Button, useToast } from "@/components/ui/UICore";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Minimum 8 characters required"),
});

export function LoginForm() {
  const { success, error } = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    try {
      await api.post("/auth/login", data);
      success("Welcome back!", "You are now logged in.");
    } catch (e) {
      error("Login failed", e.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
      <Input label="Password" type="password" error={errors.password?.message} {...register("password")} />
      <Button loading={isSubmitting} type="submit">Sign in</Button>
    </form>
  );
}