-- Run this only if the policy does not already exist.
-- It lets the one authorized admin view every product, including unavailable products.
CREATE POLICY "Admin can view all products"
ON public.products
FOR SELECT
TO authenticated
USING (
  auth.uid() = '2a54186a-ef9c-4474-a73f-60af8ec5eacc'::uuid
);